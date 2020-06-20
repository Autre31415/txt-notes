// Modules to control application life and create native browser window
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const windowStateKeeper = require('electron-window-state')

// auto reload window in dev mode
try {
  require('electron-reloader')(module, { ignore: 'tmp' })
} catch (err) { }

// handle app exit
ipcMain.handle('exit', () => {
  app.exit()
})

// handle close confirmation dialog
ipcMain.handle('confirmClose', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Confirm',
    buttons: ['Yes', 'No', 'Cancel'],
    message: `Would you like to save ${fileName} before closing?`
  })

  return result
})

// handle navigate away confirmation dialog
ipcMain.handle('confirmNavigateAway', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['No', 'Yes'],
    message: `Would you like to save ${fileName}?`
  })

  return result
})

// handle file deletion confirmation dialog
ipcMain.handle('removeHandler', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['No', 'Yes'],
    message: `Are you sure you want to delete ${fileName}?`
  })

  return result
})

// handle directory picker dialog
ipcMain.handle('directoryPicker', async (event, fileName) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  return result
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 800
  })

  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    webPreferences: {
      nodeIntegration: true
    },
    titleBarStyle: 'hiddenInset'
  })

  // and load the main entrypoint (main.html)
  mainWindow.loadFile('./templates/main.html')

  // Create the menu
  require('./menu.js')(mainWindow)

  /* Open dev tools */
  // mainWindow.webContents.openDevTools()

  mainWindowState.manage(mainWindow)

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  // inform renderer of close event
  mainWindow.on('close', event => {
    event.preventDefault()
    mainWindow.webContents.send('ping', 'confirmClose')
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
