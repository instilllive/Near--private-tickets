import { Buffer } from "buffer";
window.Buffer = Buffer;
if (!window.process) window.process = { env: { NODE_ENV: "production" } };
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
