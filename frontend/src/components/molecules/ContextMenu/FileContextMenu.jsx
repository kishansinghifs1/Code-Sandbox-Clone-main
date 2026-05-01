import './FileContextMenu.css';

import { useState } from 'react';
import { useFileContextMenuStore } from "../../../stores/fileContextMenuStore";
import { useEditorSocketStore } from '../../../stores/editorSocketStore';

export const FileContextMenu = ({
    x,
    y,
    path,
    isFolder
}) => {
    const { closeMenu } = useFileContextMenuStore();
    const { editorSocket } = useEditorSocketStore();
    const [showInput, setShowInput] = useState(null); // 'file' | 'folder' | null
    const [inputValue, setInputValue] = useState('');

    function handleFileDelete(e) {
        e.preventDefault();
        console.log("Deleting file at", path);
        editorSocket.emit("deleteFile", {
            pathToFileOrFolder: path
        });
        closeMenu();
    }

    function handleFolderDelete(e) {
        e.preventDefault();
        console.log("Deleting folder at", path);
        editorSocket.emit("deleteFolder", {
            pathToFileOrFolder: path
        });
        closeMenu();
    }

    function handleCreateFile(e) {
        e.preventDefault();
        setShowInput('file');
        setInputValue('');
    }

    function handleCreateFolder(e) {
        e.preventDefault();
        setShowInput('folder');
        setInputValue('');
    }

    function handleInputSubmit(e) {
        if (e.key === 'Enter' && inputValue.trim()) {
            const basePath = isFolder ? path : path.substring(0, path.lastIndexOf('/'));
            const newPath = `${basePath}/${inputValue.trim()}`;

            if (showInput === 'file') {
                console.log("Creating file at", newPath);
                editorSocket.emit("createFile", {
                    pathToFileOrFolder: newPath
                });
            } else if (showInput === 'folder') {
                console.log("Creating folder at", newPath);
                editorSocket.emit("createFolder", {
                    pathToFileOrFolder: newPath
                });
            }
            setShowInput(null);
            setInputValue('');
            closeMenu();
        } else if (e.key === 'Escape') {
            setShowInput(null);
            setInputValue('');
        }
    }

    return (
        <div
            onMouseLeave={() => {
                if (!showInput) {
                    closeMenu();
                }
            }}
            className='fileContextOptionsWrapper'
            style={{
                left: x,
                top: y,
            }}
        >
            {/* Create options */}
            <button
                className='fileContextButton'
                onClick={handleCreateFile}
            >
                📄 New File
            </button>
            <button
                className='fileContextButton'
                onClick={handleCreateFolder}
            >
                📁 New Folder
            </button>

            <div className="fileContextDivider" />

            {/* Delete option */}
            {isFolder ? (
                <button
                    className='fileContextButton fileContextButtonDanger'
                    onClick={handleFolderDelete}
                >
                    🗑️ Delete Folder
                </button>
            ) : (
                <button
                    className='fileContextButton fileContextButtonDanger'
                    onClick={handleFileDelete}
                >
                    🗑️ Delete File
                </button>
            )}

            {/* Inline input for name */}
            {showInput && (
                <div className="fileContextInputWrapper">
                    <input
                        type="text"
                        className="fileContextInput"
                        placeholder={showInput === 'file' ? 'file name...' : 'folder name...'}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleInputSubmit}
                        autoFocus
                    />
                </div>
            )}
        </div>
    )
}