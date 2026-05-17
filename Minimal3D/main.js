const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Set the app name before 'ready' so macOS menu bar shows the correct title
app.name = 'Mechanische Werkplaats';

let mainWindow;

function createWindow() {
  // When packaged, icon.png is placed outside app.asar in Resources/
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'icon.png');

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath);
  }

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      enableRemoteModule: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Determine if we're in development or production
  const isDev = process.env.npm_lifecycle_event === 'dev:electron' || 
                process.argv.some(arg => arg === '--dev');
  
  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist-minimal3d/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Open all external links in the default browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event handlers
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when app is activated (clicked in dock)
  if (mainWindow === null) {
    createWindow();
  }
});
