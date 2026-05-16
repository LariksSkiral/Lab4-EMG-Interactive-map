const { contextBridge, ipcMain } = require('electron');
const path = require('path');

// Safely expose environment info to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDev: process.env.npm_lifecycle_event === 'dev:electron' || 
         process.argv.some(arg => arg === '--dev'),
  resourcesPath: path.join(__dirname, '../dist-minimal3d')
});

// Log for debugging (will appear in DevTools console)
console.log('Preload script loaded. Environment:', {
  isDev: process.env.npm_lifecycle_event === 'dev:electron',
  resourcesPath: path.join(__dirname, '../dist-minimal3d')
});
