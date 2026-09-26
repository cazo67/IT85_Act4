interface Window {
  bcis: {
    getAppVersion: () => string;
    platform: NodeJS.Platform;
    saveReport: (input: { suggestedName: string; bytes: Uint8Array }) => Promise<{ saved: boolean }>;
  };
}
