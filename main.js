const path = require('path')
const fs = require('fs-extra')
const klawSync = require('klaw-sync')
const teddy = require('teddy')
const { app, BrowserWindow, clipboard, dialog, ipcMain: ipc } = require('electron')
const windowStateKeeper = require('electron-window-state')
const Store = require('electron-store')
const store = new Store()
const contextMenu = require('electron-context-menu')
const chokidar = require('chokidar')
const isDev = !app.isPackaged

// directory picker template
const dirPickerTemplate = fs.readFileSync(path.join(__dirname, 'templates/firstLoad.html'), 'utf8')

// main note viewer template
const mainTemplate = fs.readFileSync(path.join(__dirname, 'templates/noteViewer.html'), 'utf8')

// note list partial template
const noteListTemplate = fs.readFileSync(path.join(__dirname, 'templates/noteList.html'), 'utf8')

// tell Teddy where templates are
teddy.setTemplateRoot(path.join(__dirname, 'templates'))

// a global reference to all notes in the watched folder
let txtFiles

// a global reference to file watcher instance
let watcher

// global references to info about last element right clicked
let elementIsFile
let elementIsFileList

// auto reload window in dev mode
try {
  require('electron-reloader')(module, { ignore: 'tmp' })
} catch (err) { }

// handle app exit
ipc.handle('exit', () => {
  app.exit()
})

/**
 * IPC handlers
 */

// handle getting electron-store values
ipc.handle('storeGet', (event, key) => {
  // on a request for baseDir in dev mode return the tmp directory
  if (isDev && key === 'baseDir') {
    fs.ensureDirSync(('./tmp'))
    return './tmp'
  }

  return store.get(key)
})

// handle getting the platform name
ipc.handle('platform', (event) => {
  return process.platform
})

// gather up each note in the base directory
ipc.handle('gatherNotes', (event, baseDir) => {
  // start an array for txt files
  txtFiles = []

  // read all txt files in chosen directory
  klawSync(baseDir, { depthLimit: 0 }).forEach(file => {
    if (file.path.includes('.txt')) {
      const fileName = path.basename(file.path)

      // add data pertaining to each note to the array
      txtFiles.push({
        fileName: fileName,
        name: fileName.slice(0, -4), // file name with .txt chopped off
        dateCode: file.stats.mtimeMs,
        content: fs.readFileSync(file.path, 'utf8')
      })
    }
  })

  return txtFiles
})

// handler for initializing file watcher
ipc.handle('initWatcher', async (event, baseDir) => {
  await initWatcher(baseDir)
})

// create a new blank note file
ipc.handle('addNote', (event, baseDir, newFileName) => {
  const newFilePath = path.join(baseDir, newFileName)
  fs.openSync(newFilePath, 'a')
})

// update file contents
ipc.handle('updateNote', (event, baseDir, fileName, content) => {
  fs.writeFileSync(path.join(baseDir, fileName), content)
})

// return an information object for a note by path
ipc.handle('getNoteInfo', (event, baseDir, fileName) => {
  const file = path.join(baseDir, fileName)
  const stats = fs.statSync(file)
  const noteData = {
    fileName: fileName,
    name: fileName.slice(0, -4), // file name with .txt chopped off
    dateCode: stats.mtimeMs,
    content: fs.readFileSync(file, 'utf8')
  }

  return noteData
})

// handle writing data to the system clipboard
ipc.handle('writeClipboard', (event, data) => {
  clipboard.writeText(data)
})

// handle setting electron-store values
ipc.on('storeSet', (event, key, value) => {
  store.set(key, value)
})

// handle checking if a file exists
ipc.handle('fileExists', (event, file) => {
  return fileExists(file)
})

// handle close confirmation dialog
ipc.handle('confirmClose', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Confirm',
    buttons: ['Yes', 'No', 'Cancel'],
    message: `Would you like to save ${fileName} before closing?`
  })

  return result
})

// handle navigate away confirmation dialog
ipc.handle('confirmNavigateAway', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['No', 'Yes'],
    message: `Would you like to save ${fileName}?`
  })

  return result
})

// handle file deletion confirmation dialog
ipc.handle('removeHandler', async (event, baseDir, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['No', 'Yes'],
    message: `Are you sure you want to delete ${fileName}?`
  })

  // 1 means yes
  if (result.response === 1) {
    const file = path.join(baseDir, fileName)
    fs.unlinkSync(file)
    return true
  }

  return false
})

// rename a note and set last modified time
ipc.handle('renameHandler', async (event, baseDir, oldFileName, newFileName, nowTime) => {
  const date = new Date(nowTime)

  // rename the file itself
  fs.renameSync(path.join(baseDir, oldFileName), path.join(baseDir, newFileName))

  // update file modified time
  fs.utimesSync(path.join(baseDir, newFileName), date, date)
})

// handle directory picker dialog
ipc.handle('directoryPicker', async (event, fileName) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  return result
})

// render templates on demand
ipc.handle('renderTemplate', async (event, templateName, model) => {
  if (templateName === 'dirPickerTemplate') {
    return teddy.render(dirPickerTemplate)
  } else if (templateName === 'mainTemplate') {
    return teddy.render(mainTemplate, model)
  } else if (templateName === 'noteListTemplate') {
    return teddy.render(noteListTemplate, model)
  }
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
    minWidth: 500,
    minHeight: 500,
    webPreferences: {
      preload: path.resolve(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      sandbox: true
    },
    titleBarStyle: 'hiddenInset'
  })

  // and load the main entrypoint (main.html)
  mainWindow.loadFile('./templates/main.html')

  // Create the menu
  require('./menu.js')(mainWindow)

  mainWindowState.manage(mainWindow)

  // handle directory picker dialog
  ipc.handle('elementIsFile', (event, isFile, isFileList) => {
    elementIsFile = isFile
    elementIsFileList = isFileList
  })

  // Setup the context menu
  contextMenu({
    prepend: (defaultActions, params, browserWindow) => [
      {
        label: 'Copy File Name',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'copyFileName')
      },
      {
        label: 'New File',
        visible: elementIsFileList || elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'newFile')
      },
      {
        label: 'Rename File',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'renameFile')
      },
      {
        label: 'Delete File',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'deleteFile')
      }
    ]
  })

  mainWindow.on('closed', function () {
    mainWindow = null
  })

  // inform renderer of close event
  mainWindow.on('close', event => {
    event.preventDefault()
    mainWindow.webContents.send('ping', 'confirmClose')
  })
}

app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  app.quit()
})

/**
 * Check if a file exists
 * @param {string} path - Path to file
 * @returns {boolean} - If file exists at path
 */
function fileExists (path) {
  try {
    fs.accessSync(path)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Initialize watch events for selected directory
 * @param {string} baseDir - Path to notes directory
 */
async function initWatcher (baseDir) {
  // unsubscribe from a previous subscription if one exists
  if (watcher) {
    watcher.close()
  }

  // watch for file changes in base directory
  watcher = chokidar.watch(baseDir, {
    ignored: /(^|[/\\])\../,
    ignoreInitial: true,
    depth: 0
  })

  watcher
    .on('add', file => {
      const fileName = path.basename(file)

      // only trigger for txt files
      if (path.extname(file) === '.txt') {
        mainWindow.webContents.send('ping', 'createFileEvent', fileName)
      }
    })
    .on('unlink', file => {
      const fileName = path.basename(file)

      // only trigger for txt files
      if (path.extname(file) === '.txt') {
        mainWindow.webContents.send('ping', 'deleteFileEvent', fileName)
      }
    })
}
