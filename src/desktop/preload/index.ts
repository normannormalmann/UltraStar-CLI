import { contextBridge } from "electron";

// Wird in Task 9 durch die vollständige UltrastarApi ersetzt.
contextBridge.exposeInMainWorld("ultrastar", { __stub: true });
