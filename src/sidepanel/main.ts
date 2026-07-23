import { createApp } from "vue";
import { ipcMain, ipcWindow } from "../ipc/ipc";
import { createRuntimeIpcMain, createTabIpcWindow } from "../ipc/ipc-implementations";
import "./style.css";
import app from "./sidepanel.vue";

ipcMain.register(createRuntimeIpcMain);
ipcWindow.register(createTabIpcWindow);
createApp(app).mount("#app");
