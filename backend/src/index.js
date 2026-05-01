import express from "express";
import { PORT } from "./config/serverConfig.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import apiRouter from "./routes/index.js";
import cors from "cors";
import chokidar from "chokidar";
import { handleEditorSocketEvents } from "./socketHandlers/editorHandler.js";
import { setEditorNamespace } from "./controllers/agentController.js";
import "./terminalApp.js";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    method: ["GET", "POST"],
  },
});


app.use(express.json());
app.use(express.urlencoded());
app.use(cors());

app.use("/api", apiRouter);

app.get("/ping", (req, res) => { 
  return res.json({ message: "pong" });
});

const editorNamespace = io.of("/editor");
setEditorNamespace(editorNamespace);

editorNamespace.on("connection", (socket) => {

  let projectId = socket.handshake.query["projectId"];

  console.log("Project id received after connection", projectId);

  if (projectId) {
    var watcher = chokidar.watch(`./projects/${projectId}`, {
      ignored: (path) => path.includes("node_modules"),
      persistent: true ,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
      },
      ignoreInitial: true 
    });

    watcher.on("all", (event, path) => {
      console.log(event, path);
      editorNamespace.emit("fileChanged", {
        event: event,
        path: path,
        projectId: projectId
      });
    });
  }
  

  handleEditorSocketEvents(socket, editorNamespace);

  socket.on("disconnect", async () => {
    console.log("editor disconnected");
    if (watcher) {
      await watcher.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(process.cwd());
});
