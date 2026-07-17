import { createApp } from "vue";
import { ipcMain, ipcWindow } from "../ipc/ipc";
import { createRuntimeIpcMain, createSidePanelIpcWindow } from "../ipc/ipc-implementations";
import "./style.css";
import app from "./sidepanel.vue";

ipcMain.register(createRuntimeIpcMain);
ipcWindow.register(createSidePanelIpcWindow);
createApp(app).mount("#app");
