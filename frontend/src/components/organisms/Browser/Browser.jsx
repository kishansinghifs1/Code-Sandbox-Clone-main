import { useEffect, useRef } from "react";
import { Input, Row } from "antd";
import { useEditorSocketStore } from "../../../stores/editorSocketStore.js";
import { usePortStore } from "../../../stores/portStore.js";
import { ReloadOutlined } from "@ant-design/icons";

export const Browser = ({ projectId }) => {

    const browserRef = useRef(null);
    const { port } = usePortStore();

    const { editorSocket } = useEditorSocketStore();

    useEffect(() => {
        if(!port) {
            editorSocket?.emit("getPort", {
                containerName: projectId
            })
        }
    }, [port, editorSocket,projectId]);

    useEffect(() => {
        const handleFileChange = (data) => {
            console.log("File changed, auto-refreshing browser:", data);
            if(browserRef.current) {
                const oldAddr = browserRef.current.src;
                browserRef.current.src = oldAddr;
            }
        };

        editorSocket?.on("fileChanged", handleFileChange);

        return () => {
            editorSocket?.off("fileChanged", handleFileChange);
        };
    }, [editorSocket]);

    if(!port) {
        return <div>Loading....</div>
    }

    function handleRefresh() {
        if(browserRef.current) {
            const oldAddr = browserRef.current.src;
            browserRef.current.src = oldAddr;
        }
    }

    return (
        <Row
            style={{
                backgroundColor: "#22212b"
            }}
        >
            <Input 
                style={{
                    width: "100%",
                    height: "30px",
                    color: "white",
                    fontFamily: "Fira Code",
                    backgroundColor: "#282a35",
                }}
                prefix={<ReloadOutlined onClick={handleRefresh} />}
                defaultValue={`http://${window.location.hostname}:${port}`}
            />

            <iframe 
                ref={browserRef}
                src={`http://${window.location.hostname}:${port}`}
                style={{
                    width: "100%",
                    height: "95vh",
                    border: "none"
                }}
            />

        </Row>
    )

}