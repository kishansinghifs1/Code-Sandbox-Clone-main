import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useActiveFileTabStore } from "../../../stores/activeFileTabStore";
import { useEditorSocketStore } from "../../../stores/editorSocketStore";
import { extensionToFileType } from '../../../utils/extensionToFileType';

export const EditorComponent = () => {
  const timerId = useRef(null); 
  const [theme, setTheme] = useState(null);

  const { activeFileTab } = useActiveFileTabStore();
  const { editorSocket } = useEditorSocketStore();

  useEffect(() => {
    let mounted = true;

    async function downloadTheme() {
      const response = await fetch("/Dracula.json");
      const data = await response.json();
      if (mounted) setTheme(data);
    }

    downloadTheme();

    return () => {
      mounted = false;
    };
  }, []);

  function handleEditorMount(editor, monaco) {
    if (!theme) return;

    monaco.editor.defineTheme("dracula", theme);
    monaco.editor.setTheme("dracula");
  }

  function handleChange(value) {
    // Clear old timer
    if (timerId.current != null) {
      clearTimeout(timerId.current);
    }

    // Set new timer
    timerId.current = setTimeout(() => {
      const editorContent = value;
      console.log("Sending writefile event");
      editorSocket.emit("writeFile", {
        data: editorContent,
        pathToFileOrFolder: activeFileTab.path
      });
    }, 2000);
  }

  return (
    <>
      {theme && (
        <Editor
         
          defaultLanguage={undefined}
           language={extensionToFileType(activeFileTab?.extension)}
          onChange={handleChange}
          value={
            activeFileTab?.value
              ? activeFileTab.value
              : "// Welcome to the playground"
          }
          onMount={handleEditorMount}
        />
      )}
    </>
  );
};
