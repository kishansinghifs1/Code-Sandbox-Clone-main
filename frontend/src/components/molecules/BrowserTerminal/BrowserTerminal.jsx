import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from 'react';
import { AttachAddon } from '@xterm/addon-attach';
import { useTerminalSocketStore } from '../../../stores/terminalSocketStore';

export const BrowserTerminal = () => {
    const terminalRef = useRef(null);
    const { terminalSocket } = useTerminalSocketStore();

    useEffect(() => {
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: "#282a37",
                foreground: "#f8f8f3",
                cursor: "#f8f8f3",
                cursorAccent: "#282a37",
                red: "#ff5544",
                green: "#50fa7c",
                yellow: "#f1fa8c",
                cyan: "#8be9fd",
            },
            fontSize: 16,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit(); // Initial fit

        // 🔥 Auto-resize when container size changes
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });

        resizeObserver.observe(terminalRef.current);

        let handleOpen;

        if (terminalSocket) {
            handleOpen = () => {
                const attachAddon = new AttachAddon(terminalSocket);
                term.loadAddon(attachAddon);
            };

            if (terminalSocket.readyState === WebSocket.OPEN) {
                handleOpen();
            } else {
                terminalSocket.addEventListener("open", handleOpen);
            }
        }

        return () => {
            resizeObserver.disconnect();
            if (terminalSocket && handleOpen) {
                terminalSocket.removeEventListener("open", handleOpen);
            }
            term.dispose();
        };
    }, [terminalSocket]);

    return (
        <div
            ref={terminalRef}
            style={{
                height: "100%",   // 🔥 important: fill allotment pane
                width: "100%",
            }}
            className="terminal"
        />
    );
};
