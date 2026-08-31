/**
 * Boot: apply the stored theme pack before the first paint (index.html also
 * sets data-theme to avoid a flash), then mount the mxQuery shell.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppVersionProvider } from "./components/AppVersionProvider";
import { AdminProvider } from "./components/settings/AdminProvider";
import { ThemeProvider } from "./components/settings/ThemeProvider";
import { bootTheme } from "./lib/theme";
import "./styles.css";

bootTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppVersionProvider>
        <AdminProvider>
          <App />
        </AdminProvider>
      </AppVersionProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
