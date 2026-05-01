import fs from "fs/promises";
import path from "path";
import { getContainerPort } from "../containers/handleContainerCreate.js";

export const handleEditorSocketEvents = (socket,editorNamespace) => {
    socket.on("writeFile", async ({ data, pathToFileOrFolder }) => {
        try {
            const response = await fs.writeFile(pathToFileOrFolder, data);
            editorNamespace.emit("writeFileSuccess", {
                data: "File written successfully",
                path: pathToFileOrFolder,
            })
        } catch(error) {
            console.log("Error writing the file", error);
            socket.emit("error", {
                data: "Error writing the file",
            });
        }
    });

    socket.on("createFile", async ({ pathToFileOrFolder }) => {
        try {
            // Check if the file already exists
            try {
                await fs.stat(pathToFileOrFolder);
                // If stat succeeds, file exists
                socket.emit("error", {
                    data: "File already exists",
                });
                return;
            } catch (e) {
                // File doesn't exist, which is expected — continue creating it
            }

            // Ensure parent directory exists
            const parentDir = path.dirname(pathToFileOrFolder);
            await fs.mkdir(parentDir, { recursive: true });

            await fs.writeFile(pathToFileOrFolder, "");
            socket.emit("createFileSuccess", {
                data: "File created successfully",
            });
        } catch(error) {
            console.log("Error creating the file", error);
            socket.emit("error", {
                data: "Error creating the file",
            });
        }
    });


    socket.on("readFile", async ({ pathToFileOrFolder }) => {
        try {
            const response = await fs.readFile(pathToFileOrFolder);
            console.log(response.toString());
            socket.emit("readFileSuccess", {
                value: response.toString(),
                path: pathToFileOrFolder,
            })
        } catch(error) {
            console.log("Error reading the file", error);
            socket.emit("error", {
                data: "Error reading the file",
            });
        }
    });

    socket.on("deleteFile", async ({ pathToFileOrFolder }) => {
        try {
            await fs.unlink(pathToFileOrFolder);
            socket.emit("deleteFileSuccess", {
                data: "File deleted successfully",
            });
        } catch(error) {
            console.log("Error deleting the file", error);
            socket.emit("error", {
                data: "Error deleting the file",
            });
        }
    });

    socket.on("createFolder", async ({ pathToFileOrFolder}) => {
        try {
            // Use recursive: true so nested folders can be created
            await fs.mkdir(pathToFileOrFolder, { recursive: true });
            socket.emit("createFolderSuccess", {
                data: "Folder created successfully",
            });
        } catch(error) {
            console.log("Error creating the folder", error);
            socket.emit("error", {
                data: "Error creating the folder",
            });
        }
    });

    socket.on("deleteFolder", async ({ pathToFileOrFolder }) => {
        try {
            // Use fs.rm with recursive instead of deprecated fs.rmdir
            await fs.rm(pathToFileOrFolder, { recursive: true, force: true });
            socket.emit("deleteFolderSuccess", {
                data: "Folder deleted successfully",
            });
        } catch(error) {
            console.log("Error deleting the folder", error);
            socket.emit("error", {
                data: "Error deleting the folder",
            });
        }
    });
    socket.on("getPort", async ({ containerName }) => {
        const port = await getContainerPort(containerName);
        console.log("port data", port);
        socket.emit("getPortSuccess", {
            port: port,
        })
    })

}