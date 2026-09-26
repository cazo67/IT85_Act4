import { contextBridge, ipcRenderer } from "electron";

export interface BcisDesktopApi {
  getAppVersion: () => string;
  platform: NodeJS.Platform;
  saveReport: (input: { suggestedName: string; bytes: Uint8Array }) => Promise<{ saved: boolean }>;
}

const desktopApi: BcisDesktopApi = Object.freeze({
  getAppVersion: () => process.env.npm_package_version ?? "0.1.0",
  platform: process.platform,
  saveReport: (input: { suggestedName: string; bytes: Uint8Array }) => ipcRenderer.invoke("bcis:save-report", input) as Promise<{ saved: boolean }>
});

contextBridge.exposeInMainWorld("bcis", desktopApi);
