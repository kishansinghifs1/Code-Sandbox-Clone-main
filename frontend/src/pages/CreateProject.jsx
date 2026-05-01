import { Button } from "antd";
import { useCreateProject } from "../hooks/apis/mutations/useCreateProject";
import { useNavigate } from "react-router-dom";

export const CreateProject = () => {
  const { createProjectMutation } = useCreateProject();
  const navigate = useNavigate();

  async function handleCreateProject() {
    try {
      const response = await createProjectMutation();
      navigate(`/project/${response.data}`);
    } catch (error) {
      console.log("Error creating project", error);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.gridOverlay} />
      <div style={styles.glow} />
      <div style={styles.glow2} />

      <div style={styles.content}>
        <h1 style={styles.title}>CODE SANDBOX</h1>
        <p style={styles.subtitle}>
          Spin up a live coding environment in seconds.
        </p>

        <Button
          size="large"
          onClick={handleCreateProject}
          style={styles.button}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px) scale(1.03)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translateY(0px) scale(1)"}
        >
          🚀 Create Playground
        </Button>
      </div>
    </div>
  );
};

const styles = {
  wrapper: {
    height: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #0b1120, #111827, #0b1120)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    fontFamily: "Inter, sans-serif",
  },

  /* Subtle tech grid */
  gridOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
    backgroundSize: "60px 60px",
    zIndex: 0,
  },

  /* Primary glow */
  glow: {
    position: "absolute",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)",
    filter: "blur(120px)",
    animation: "float 8s ease-in-out infinite",
  },

  /* Secondary glow */
  glow2: {
    position: "absolute",
    width: "500px",
    height: "500px",
    background: "radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)",
    filter: "blur(120px)",
    top: "20%",
    left: "60%",
    animation: "float 10s ease-in-out infinite reverse",
  },

  content: {
    textAlign: "center",
    zIndex: 2,
    color: "white",
    animation: "fadeIn 1s ease forwards",
  },

  /* Gradient glowing title */
  title: {
    fontSize: "64px",
    fontWeight: 800,
    marginBottom: "16px",
    letterSpacing: "2px",
    background: "linear-gradient(90deg, #6366f1, #8b5cf6, #22d3ee)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },

  subtitle: {
    fontSize: "20px",
    color: "#cbd5e1",
    marginBottom: "40px",
  },

  button: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    border: "none",
    color: "white",
    padding: "0 48px",
    height: "56px",
    fontSize: "18px",
    fontWeight: "600",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(99,102,241,0.5)",
    transition: "all 0.25s ease",
  },
};
