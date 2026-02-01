import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import useEventListenerStore from "./stores/event-listener-store";

// Activate Tauri event listeners for the full app lifetime (no cleanup until app closes)
useEventListenerStore.getState().initEventListeners();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
