# Chapter 9 — Terminal System

This chapter explains how the browser terminal works — from the raw WebSocket connection to Docker stream multiplexing to xterm.js rendering.

---

## 9.1 Terminal Handler — `backend/src/containers/handleTerminalCreation.js`

Once a Docker container is created (Chapter 8), this handler attaches a bash shell to the WebSocket connection.

### `handleTerminalCreation(container, ws)`

```javascript
export const handleTerminalCreation = (container, ws) => {
    if (!container) return;

    // Create a new exec instance inside the container
    container.exec({
        Cmd: ["/bin/bash"],      // Start a bash shell
        AttachStdin: true,       // We'll send keystrokes
        AttachStdout: true,      // We'll receive output
        AttachStderr: true,      // We'll receive errors
        Tty: true,               // Pseudo-terminal mode
        User: "sandbox",         // Run as the sandbox user
    }, (err, exec) => {
        if (err) {
            console.log("Error while creating exec", err);
            return;
        }

        // Start the exec session
        exec.start({
            hijack: true,  // Take over the stream for raw binary I/O
        }, (err, stream) => {
            if (err) {
                console.log("Error while starting exec", err);
                return;
            }

            // Step 1: Process container output → send to browser
            processStreamOutput(stream, ws);

            // Step 2: Process browser input → send to container
            ws.on("message", (data) => {
                if (data === "getPort") {
                    // Special command to get container port info
                    container.inspect((err, data) => {
                        const port = data.NetworkSettings;
                        console.log(port);
                    });
                    return;
                }
                // Forward user keystrokes to the container
                stream.write(data);
            });
        });
    });
};
```

### Key Concepts:

1. **`container.exec`** — Creates a new process inside a running container. Unlike `container.attach`, this creates a *new* bash session rather than attaching to the container's main process.

2. **`hijack: true`** — Tells Docker to give us raw binary access to the stream. This is necessary because Docker multiplexes stdout and stderr into a single stream with headers.

3. **Bidirectional Flow:**
   - **Browser → Container:** `ws.on("message")` → `stream.write(data)` — Keystrokes flow from xterm.js through the WebSocket to Docker's exec stream
   - **Container → Browser:** `stream.on("data")` → `ws.send(content)` — Output flows from Docker through the stream processor to the WebSocket

---

## 9.2 Docker Stream Multiplexing — `processStreamOutput()`

Docker multiplexes stdout and stderr into a single binary stream using a header protocol. Each message has:

```
┌────────────┬────────────┬─────────────────────┐
│ Type (4B)  │ Length (4B)│ Payload (variable)   │
└────────────┴────────────┴─────────────────────┘
     Header (8 bytes)          Message body
```

- **Type** (4 bytes, big-endian uint32): `0` = stdin, `1` = stdout, `2` = stderr
- **Length** (4 bytes, big-endian uint32): Length of the payload in bytes
- **Payload**: The actual terminal output

### The Stream Processor

```javascript
function processStreamOutput(stream, ws) {
    let nextDataType = null;    // Type of the next message
    let nextDataLength = null;  // Length of the next message
    let buffer = Buffer.from(""); // Accumulator for incoming data

    function processStreamData(data) {
        if (data) {
            buffer = Buffer.concat([buffer, data]); // Append new data
        }

        if (!nextDataType) {
            // We don't know the message type yet — read the 8-byte header
            if (buffer.length >= 8) {
                const header = bufferSlicer(8);
                nextDataType = header.readUInt32BE(0);    // First 4 bytes = type
                nextDataLength = header.readUInt32BE(4);  // Next 4 bytes = length

                processStreamData(); // Recursively process (no new data, just continue parsing)
            }
        } else {
            // We know the type and length — wait for the full payload
            if (buffer.length >= nextDataLength) {
                const content = bufferSlicer(nextDataLength);
                ws.send(content);  // Send the raw content to the browser

                // Reset for the next message
                nextDataType = null;
                nextDataLength = null;

                processStreamData(); // Continue processing any remaining data
            }
        }
    }

    function bufferSlicer(end) {
        // Slice the buffer: return the first `end` bytes, keep the rest
        const output = buffer.slice(0, end);
        buffer = Buffer.from(buffer.slice(end, buffer.length));
        return output;
    }

    stream.on("data", processStreamData);
}
```

### How It Works (Step by Step):

1. Docker sends a chunk of binary data
2. The chunk is appended to the buffer
3. **If we don't have a header yet:** Check if buffer has ≥8 bytes. If yes, read the 8-byte header to get the message type and length.
4. **If we have a header:** Check if buffer has ≥ `nextDataLength` bytes. If yes, extract the payload and send it to the browser.
5. Reset and repeat (recursively) to handle multiple messages in a single chunk.

### Why This Complexity?

Docker doesn't send one clean message at a time. TCP delivers data in arbitrary chunks:
- One chunk might contain half a header
- One chunk might contain 3 complete messages
- One chunk might split a message in the middle

The buffer accumulation and recursive processing handles all these edge cases.

---

## 9.3 The Complete Terminal Data Flow

```
User presses 'l' key
        │
        ▼
xterm.js captures keystroke
        │
        ▼
AttachAddon sends 'l' via WebSocket
        │
        ▼
terminalApp.js receives message
        │
        ▼
ws.on("message") → stream.write('l')
        │
        ▼
Docker exec stream → bash receives 'l'
        │
        ▼
bash echoes 'l' back + prompt changes
        │
        ▼
Docker multiplexes output: [header(8B)][content]
        │
        ▼
stream.on("data") → processStreamOutput
        │
        ▼
Strip header → ws.send(content)
        │
        ▼
Browser WebSocket receives raw bytes
        │
        ▼
AttachAddon feeds bytes into xterm.js
        │
        ▼
xterm.js renders 'l' on screen
```

---

## 9.4 Terminal Features

| Feature | How It Works |
|---|---|
| **Colored output** | `Tty: true` enables ANSI escape codes; xterm.js interprets them |
| **Tab completion** | Bash handles it natively; keystrokes pass through transparently |
| **Full-screen apps** | Works (e.g., `nano`, `vim`) because of TTY mode |
| **Resize** | `FitAddon` adjusts xterm.js size; container doesn't auto-resize (known limitation) |
| **Multiple terminals** | Each WebSocket connection creates a new `container.exec` session |

---

## 9.5 Special: `getPort` Command

The terminal handler has a special intercept for `"getPort"`:

```javascript
if (data === "getPort") {
    container.inspect((err, data) => {
        const port = data.NetworkSettings;
        console.log(port);
    });
    return;
}
```

This is a debug/utility feature that logs the container's network settings (including port mappings) to the backend console. It's not actively used in the current UI — the `Browser` component uses the Socket.IO `getPort` event instead.

---

> **Next Chapter:** [Chapter 10 — AI Agent (CogniBox) →](./chapter-10-ai-agent.md)
