const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mallExpensesAPI', {
  request: (path, options = {}) => ipcRenderer.invoke('mallExpenses:request', { path, options }),
});
