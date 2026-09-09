const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('firePlans', {
  save: (name, data) => ipcRenderer.invoke('save-plan-file', name, data),
});

contextBridge.exposeInMainWorld('fireUpdater', {
  check: () => ipcRenderer.invoke('check-for-updates'),
  install: (downloadUrl) => ipcRenderer.invoke('download-and-install-update', downloadUrl),
});
