import type { BrowserWindowConstructorOptions } from "electron";

export function getMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !process.env.BCIS_DISABLE_DEVTOOLS
    }
  };
}

export function getContentSecurityPolicy(apiOrigin = "http://127.0.0.1:4100", development = false): string {
  const parsed = new URL(apiOrigin);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/") throw new Error("BCIS_API_ORIGIN must be an HTTP(S) origin without credentials or a path.");
  const developmentConnections = development ? " ws://localhost:* ws://127.0.0.1:*" : "";
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${parsed.origin}${developmentConnections}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
}
