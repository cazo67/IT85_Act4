import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { getContentSecurityPolicy, getMainWindowOptions } from "./window-options.js";

function createWindow(): BrowserWindow {
  const window = new BrowserWindow(getMainWindowOptions(join(__dirname, "../preload/index.cjs")));
  const policy = getContentSecurityPolicy(process.env.BCIS_API_ORIGIN, !app.isPackaged);
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [policy] } }));

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (currentUrl && new URL(url).origin !== new URL(currentUrl).origin) {
      event.preventDefault();
    }
  });

  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  ipcMain.handle("bcis:save-report", async (_event, input: unknown) => {
    if (!isReportSaveInput(input)) throw new Error("Invalid report save request.");
    const extension = extname(input.suggestedName).toLowerCase();
    const result = await dialog.showSaveDialog({ defaultPath: basename(input.suggestedName), filters: [{ name: extension === ".pdf" ? "PDF report" : "Excel workbook", extensions: [extension.slice(1)] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, input.bytes);
    return { saved: true };
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function isReportSaveInput(value: unknown): value is { suggestedName: string; bytes: Uint8Array } {
  if (!value || typeof value !== "object") return false;
  const input = value as { suggestedName?: unknown; bytes?: unknown };
  return typeof input.suggestedName === "string" && /^[A-Za-z0-9._-]+\.(pdf|xlsx)$/.test(input.suggestedName) && input.bytes instanceof Uint8Array && input.bytes.byteLength <= 50 * 1024 * 1024;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
