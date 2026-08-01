import { createPinia } from "pinia";
import { createApp } from "vue";
import { ipcMain, ipcWindow } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcMain, createTabIpcWindow } from "./side-panel-ipc-adapter";
import app from "./side-panel.vue";

ipcMain.register(createRuntimeIpcMain);
ipcWindow.register(createTabIpcWindow);
createApp(app).use(createPinia()).mount("#app");
