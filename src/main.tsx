import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyStartupPane } from "@/lib/startup";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { startLocaleMenuSync } from "@/lib/localeMenu";

const stopLocaleMenuSync = startLocaleMenuSync();
if (import.meta.hot) import.meta.hot.dispose(stopLocaleMenuSync);

const settings = useSettingsStore.getState();
applyStartupPane(settings.available ? settings.preferences : null, useUiStore.getState().setActivePane);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
