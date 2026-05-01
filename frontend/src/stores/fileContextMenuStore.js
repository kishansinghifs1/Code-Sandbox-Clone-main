import { create } from "zustand";

export const useFileContextMenuStore = create((set) => ({
    x: null,
    y: null,
    isOpen: false,
    file: null,
    isFolder: false,
    setX: (incomingX) => {
        set({
            x: incomingX
        });
    },
    setY: (incomingY) => {
        set({
            y: incomingY
        });
    },
    setIsOpen: (incomingIsOpen) => {
        set({
            isOpen: incomingIsOpen
        });
    },
    setFile: (incomingFile) => {
        set({
            file: incomingFile
        });
    },
    setIsFolder: (incomingIsFolder) => {
        set({
            isFolder: incomingIsFolder
        });
    },
    openMenu: ({ x, y, path, isFolder }) => {
        set({
            x,
            y,
            file: path,
            isFolder: !!isFolder,
            isOpen: true
        });
    },
    closeMenu: () => {
        set({
            isOpen: false,
            x: null,
            y: null,
            file: null,
            isFolder: false
        });
    }
}));