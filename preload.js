// filepath: /Users/rgriola/Desktop/01_Vibecode/WatchFolder/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onLog: (callback) => ipcRenderer.on('log-message', (event, message, type) => callback(message, type)),
    onStatus: (callback) => ipcRenderer.on('status-message', (event, message) => callback(message)),
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, progressData) => callback(progressData)),
    processDroppedFiles: (filePaths) => ipcRenderer.invoke('process-dropped-files', filePaths),
    selectFiles: () => ipcRenderer.invoke('select-files'),
    openHistory: () => ipcRenderer.invoke('open-history'),
    getManifest: () => ipcRenderer.invoke('get-manifest'),
    getManifestData: () => ipcRenderer.invoke('get-manifest-data'),
    testMetadata: (filePath) => ipcRenderer.invoke('test-metadata', filePath)
});