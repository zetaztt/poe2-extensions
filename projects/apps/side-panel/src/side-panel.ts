import { createPinia } from "pinia";
import { createApp } from "vue";
import "./side-panel-ipc-channels";
import app from "./side-panel.vue";

createApp(app).use(createPinia()).mount("#app");
