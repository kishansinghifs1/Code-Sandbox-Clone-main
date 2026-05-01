import { useEffect, useState } from "react";
import { IoIosArrowDown, IoIosArrowForward } from "react-icons/io";
import { FileIcon } from "../../atoms/FileIcon/FileIcon";
import { useEditorSocketStore } from "../../../stores/editorSocketStore";
import { useFileContextMenuStore } from "../../../stores/fileContextMenuStore";
import { FaFolder, FaFolderOpen } from "react-icons/fa";
import { VscFile } from "react-icons/vsc";

export const TreeNode = ({ fileFolderData }) => {
  const [visibility, setVisibility] = useState({});
  const { editorSocket } = useEditorSocketStore();

  const { openMenu } = useFileContextMenuStore();

  function toggleVisibility(name) {
    setVisibility({
      ...visibility,
      [name]: !visibility[name],
    });
  }

  function computeExtension(fileFolderData) {
    const names = fileFolderData.name.split(".");
    return names[names.length - 1];
  }
  function handleDoubleClick(fileFolderData) {
    console.log("Double clicked on", fileFolderData);
    editorSocket.emit("readFile", {
      pathToFileOrFolder: fileFolderData.path,
    });
  }

  function handleContextMenu(e, path, isFolder) {
    e.preventDefault();
    e.stopPropagation();
    console.log("Right clicked on", path, "isFolder:", isFolder);
    openMenu({
      x: e.clientX,
      y: e.clientY,
      path,
      isFolder
    });
  }

  useEffect(() => {
    console.log("Visibility changed", visibility);
  }, [visibility]);

  return (
    fileFolderData && (
      <div
        style={{
          paddingLeft: "15px",
          color: "white",
        }}
      >
        {fileFolderData.children /** If the current node is a folder ? */ ? (
          /** If the current node is a folder, render it as a button */
          <button
            onClick={() => toggleVisibility(fileFolderData.name)}
            onContextMenu={(e) =>
              handleContextMenu(e, fileFolderData.path, true)
            }
            style={styles.folderButton}
          >
            {visibility[fileFolderData.name] ? (
              <IoIosArrowDown size={14} />
            ) : (
              <IoIosArrowForward size={14} />
            )}

            {visibility[fileFolderData.name] ? (
              <FaFolderOpen style={styles.folderIcon} />
            ) : (
              <FaFolder style={styles.folderIcon} />
            )}

            <span style={styles.folderName}>{fileFolderData.name}</span>
          </button>
        ) : (
          /** If the current node is not a folder, render it as a p */
          <div style={{ display: "flex", alignItems: "center" }}>
            <FileIcon extension={computeExtension(fileFolderData)} />
            <p
              style={{
                paddingTop: "5px",
                fontSize: "15px",
                cursor: "pointer",
                marginLeft: "5px",
                marginTop: "10px",
                marginBottom: "10px",
                // color: "black"
              }}
              onContextMenu={(e) =>
                handleContextMenu(e, fileFolderData.path, false)
              }
              onDoubleClick={() => handleDoubleClick(fileFolderData)}
            >
              {fileFolderData.name}
            </p>
          </div>
        )}
        {visibility[fileFolderData.name] &&
          fileFolderData.children &&
          fileFolderData.children.map((child) => (
            <TreeNode fileFolderData={child} key={child.name} />
          ))}
      </div>
    )
  );
};
const styles = {
  folderButton: {
    border: "none",
    cursor: "pointer",
    outline: "none",
    color: "#d4d4d4",
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 0",
    fontSize: "14px",
  },
  folderIcon: {
    color: "#eab308", // VS Code yellow folder
    fontSize: "20px",
  },
  folderName: {
    fontSize: "14px",
    fontWeight: 500,
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 0",
    cursor: "pointer",
  },
  fileIcon: {
    color: "#9ca3af",
    fontSize: "14px",
  },
  fileName: {
    fontSize: "14px",
    margin: 0,
    color: "#d4d4d4",
  },
};
