const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fireUpdater', {
  check: () => ipcRenderer.invoke('check-for-updates'),
  install: (downloadUrl) => ipcRenderer.invoke('download-and-install-update', downloadUrl),
});
