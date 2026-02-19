import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauriRuntime } from "./lib/runtime";
import useEventListenerStore from "./stores/event-listener-store";

const tauriRuntime = isTauriRuntime();

// Activate Tauri event listeners for the full app lifetime (no cleanup until app closes)
if (tauriRuntime) {
  useEventListenerStore.getState().initEventListeners();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  tauriRuntime ? (
    <App />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ),
);
