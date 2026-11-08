const path = require('path')
const fs = require('fs/promises')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const teddy = require('teddy')
const { app, BrowserWindow, clipboard, dialog, ipcMain: ipc, nativeTheme, shell } = require('electron')
const windowStateKeeper = require('electron-window-state')
const isDev = !app.isPackaged

// tests run the app with their own settings directory
const isTest = !!process.env.TXT_NOTES_USER_DATA

// keep development and test runs away from the installed app's settings
if (isTest) {
  app.setPath('userData', process.env.TXT_NOTES_USER_DATA)
} else if (isDev) {
  app.setPath('userData', app.getPath('userData') + '-dev')
}

// only one copy runs per settings directory, so two windows can't overwrite each other's saves
if (!app.requestSingleInstanceLock()) {
  process.exit(0)
}

// a second launch brings the existing window forward instead
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }
})

// window title, marked when running from source so it can't be mistaken for the installed app
const appTitle = isDev ? `${app.getName()} (dev)` : app.getName()

// app settings, saved as json in the user data directory
const settingsFile = path.join(app.getPath('userData'), 'config.json')
let settings = {}
try {
  settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
} catch {} // no settings saved yet

/**
 * Save a setting to the settings file
 * @param {string} key - Setting name
 * @param {*} value - Setting value
 */
function saveSetting (key, value) {
  settings[key] = value
  mkdirSync(path.dirname(settingsFile), { recursive: true })
  writeFileSync(settingsFile, JSON.stringify(settings, null, '\t'))
}

// light or dark mode, following the system unless the user picked one; the page follows along through prefers-color-scheme
const appearances = ['system', 'light', 'dark']
nativeTheme.themeSource = appearances.includes(settings.appearance) ? settings.appearance : 'system'

/**
 * Change and remember the app's appearance
 * @param {string} appearance - One of system, light, or dark
 */
function setAppearance (appearance) {
  if (appearances.includes(appearance)) {
    nativeTheme.themeSource = appearance
    saveSetting('appearance', appearance)
  }
}

/**
 * Window background matching the page, so there's no flash before it's drawn
 * @returns {string} - Background color for the current appearance
 */
function windowBackground () {
  return nativeTheme.shouldUseDarkColors ? '#363636' : '#f3f3f3'
}

// directory picker template
const dirPickerTemplate = readFileSync(path.join(__dirname, 'templates/firstLoad.html'), 'utf8')

// main note viewer template
const mainTemplate = readFileSync(path.join(__dirname, 'templates/noteViewer.html'), 'utf8')

// note list partial template
const noteListTemplate = readFileSync(path.join(__dirname, 'templates/noteList.html'), 'utf8')

// tell Teddy where templates are
teddy.setTemplateRoot(path.join(__dirname, 'templates'))

// in-memory cache of note contents, keyed by base directory then file name
const notesCache = new Map()

// global references to info about last element right clicked
let elementIsFile
let elementIsFileList
let elementIsPinned

// auto reload window in dev mode, but not during tests where a restart would break the run
if (!isTest) {
  try {
    require('electron-reloader')(module, { ignore: 'tmp' })
  } catch {}
}

// handle app exit
ipc.handle('exit', () => {
  app.exit()
})

/**
 * IPC handlers
 */

// handle getting settings values
ipc.handle('storeGet', async (event, key) => {
  // on a request for baseDir in dev mode return the tmp directory
  if (isDev && key === 'baseDir') {
    await fs.mkdir('./tmp', { recursive: true })
    return './tmp'
  }

  return settings[key]
})

// handle getting the platform name
ipc.handle('platform', (event) => {
  return process.platform
})

// open native print dialog for currently viewed note
ipc.handle('printNote', () => {
  mainWindow.webContents.print({
    color: false
  })
})

// gather up each note in the base directory
ipc.handle('gatherNotes', async (event, baseDir) => {
  // only one directory is in use at a time, so drop caches for any other
  if (!notesCache.has(baseDir)) {
    notesCache.clear()
  }

  const cachedMap = notesCache.get(baseDir) || new Map()
  const txtFileNames = (await fs.readdir(baseDir)).filter(fileName => path.extname(fileName) === '.txt')

  // read all txt files in chosen directory in parallel
  const results = await Promise.all(txtFileNames.map(async fileName => {
    const filePath = path.join(baseDir, fileName)
    const stats = await fs.stat(filePath)

    // skip anything that isn't a regular file (e.g. a folder named .txt)
    if (!stats.isFile()) {
      return null
    }

    const { mtimeMs } = stats
    const cachedNote = cachedMap.get(fileName)

    // reuse cached content when the file hasn't changed since it was last read
    if (cachedNote && cachedNote.dateCode === mtimeMs) {
      return cachedNote
    }

    return {
      fileName,
      name: path.parse(fileName).name, // file name without extension
      dateCode: mtimeMs,
      content: await readNote(filePath)
    }
  }))

  const newNotes = results.filter(Boolean)
  notesCache.set(baseDir, new Map(newNotes.map(note => [note.fileName, note])))
  return newNotes
})

// create a new blank note file
ipc.handle('addNote', async (event, baseDir, newFileName) => {
  // appending nothing creates the file without touching an existing one
  await fs.appendFile(path.join(baseDir, newFileName), '')
})

// update file contents, keeping the encoding the file already uses
ipc.handle('updateNote', async (event, baseDir, fileName, content) => {
  const filePath = path.join(baseDir, fileName)
  let encoding = 'utf8'

  try {
    const handle = await fs.open(filePath, 'r')
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(3), 0, 3, 0)
    await handle.close()
    encoding = detectEncoding(buffer.subarray(0, bytesRead))
  } catch {} // a missing file is written as utf8

  await fs.writeFile(filePath, encodeNote(content, encoding))
})

// update window title to include file name
ipc.handle('updateTitle', async (event, name) => {
  // reset to just the app name when no note is open
  mainWindow.setTitle(name ? `${name} — ${appTitle}` : appTitle)
})

// return an information object for a note by path
ipc.handle('getNoteInfo', async (event, baseDir, fileName) => {
  const file = path.join(baseDir, fileName)
  const stats = await fs.stat(file)
  const noteData = {
    fileName,
    name: path.parse(fileName).name, // file name without extension
    dateCode: stats.mtimeMs,
    content: await readNote(file)
  }

  return noteData
})

// copy a dropped file into the notes directory and return its new name, or null if it can't be a note
ipc.handle('importNote', async (event, baseDir, filePath) => {
  // only regular files can become notes, not folders named like txt files
  if (!(await fs.stat(filePath)).isFile()) {
    return null
  }

  const { dir, base, name, ext } = path.parse(filePath)

  // a file dropped from the notes directory is already there
  if (path.resolve(dir) === path.resolve(baseDir)) {
    return base
  }

  // number the copy if a note with that name already exists
  let fileName = base
  for (let i = 2; existsSync(path.join(baseDir, fileName)); i++) {
    fileName = `${name} (${i})${ext}`
  }

  await fs.copyFile(filePath, path.join(baseDir, fileName))
  return fileName
})

// reveal a note in the system file browser
ipc.handle('showInFolder', (event, baseDir, fileName) => {
  shell.showItemInFolder(path.resolve(baseDir, fileName))
})

// save a copy of a note under a name and location the user picks
ipc.handle('exportNote', async (event, baseDir, fileName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), fileName),
    filters: [{ name: 'Text', extensions: ['txt'] }]
  })

  if (!result.canceled && result.filePath) {
    await fs.copyFile(path.join(baseDir, fileName), result.filePath)
  }
})

// handle writing data to the system clipboard
ipc.handle('writeClipboard', (event, data) => {
  clipboard.writeText(data)
})

// handle updating settings
ipc.on('storeSet', (event, key, value) => saveSetting(key, value))

// handle checking if a file exists
ipc.handle('fileExists', async (event, file) => {
  return existsSync(file)
})

// handle close confirmation dialog
ipc.handle('confirmClose', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Confirm',
    buttons: ['Save', "Don't Save", 'Cancel'],
    message: `Would you like to save ${fileName} before closing?`,
    defaultId: 0
  })

  return result
})

// handle navigate away confirmation dialog
ipc.handle('confirmNavigateAway', async (event, fileName) => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    message: `Would you like to save ${fileName}?`,
    defaultId: 0
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
    await fs.unlink(file)
    return true
  }

  return false
})

// rename a note and set last modified time
ipc.handle('renameHandler', async (event, baseDir, oldFileName, newFileName, nowTime) => {
  const date = new Date(nowTime)

  // rename the file itself
  await fs.rename(path.join(baseDir, oldFileName), path.join(baseDir, newFileName))

  // update file modified time
  await fs.utimes(path.join(baseDir, newFileName), date, date)
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

// byte order marks that identify a text file's encoding
const BOMS = {
  utf8bom: Buffer.from([0xEF, 0xBB, 0xBF]),
  utf16le: Buffer.from([0xFF, 0xFE]),
  utf16be: Buffer.from([0xFE, 0xFF])
}

/**
 * Work out a note's encoding from its first bytes, defaulting to utf8
 * @param {Buffer} buffer - Start of the file
 * @returns {string} - One of utf8, utf8bom, utf16le, utf16be
 */
function detectEncoding (buffer) {
  for (const [encoding, bom] of Object.entries(BOMS)) {
    if (buffer.subarray(0, bom.length).equals(bom)) {
      return encoding
    }
  }

  return 'utf8'
}

/**
 * Read a note as text, decoding UTF-16 and stripping any byte order mark
 * @param {string} filePath - Path to the note
 * @returns {string} - Note content
 */
async function readNote (filePath) {
  const buffer = await fs.readFile(filePath)
  const encoding = detectEncoding(buffer)
  const body = buffer.subarray(encoding === 'utf8' ? 0 : BOMS[encoding].length)
  const decoder = encoding === 'utf16le' || encoding === 'utf16be' ? encoding.replace('utf16', 'utf-16') : 'utf-8'

  return new TextDecoder(decoder).decode(body)
}

/**
 * Encode note content for writing in a given encoding, restoring its byte order mark
 * @param {string} content - Note content
 * @param {string} encoding - One of utf8, utf8bom, utf16le, utf16be
 * @returns {Buffer} - Bytes to write
 */
function encodeNote (content, encoding) {
  if (encoding === 'utf16le') {
    return Buffer.concat([BOMS.utf16le, Buffer.from(content, 'utf16le')])
  } else if (encoding === 'utf16be') {
    return Buffer.concat([BOMS.utf16be, Buffer.from(content, 'utf16le').swap16()])
  } else if (encoding === 'utf8bom') {
    return Buffer.concat([BOMS.utf8bom, Buffer.from(content, 'utf8')])
  }

  return Buffer.from(content, 'utf8')
}

/**
 * Open a link in the system default app when it uses a safe protocol
 * @param {string} url - Link to open
 */
function openExternalLink (url) {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) {
      shell.openExternal(url)
    }
  } catch {}
}

/**
 * Let the user know when a newer release is available on GitHub
 * @param {boolean} quiet - Only speak up when there's an update
 */
async function checkForUpdates (quiet) {
  const current = app.getVersion()
  let release

  try {
    const response = await fetch('https://api.github.com/repos/Autre31415/txt-notes/releases/latest')
    release = await response.json()
    release.version = release.tag_name.replace(/^v/, '')
  } catch {
    if (!quiet) {
      dialog.showMessageBox({ type: 'error', message: 'Unable to check for updates.' })
    }
    return
  }

  // numeric comparison so 0.10.0 counts as newer than 0.9.0
  if (release.version.localeCompare(current, undefined, { numeric: true }) > 0) {
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Download', 'Later'],
      message: `txt-notes ${release.version} is available.`,
      detail: `You have version ${current}.`,
      defaultId: 0
    })

    // 0 means download
    if (result.response === 0) {
      openExternalLink(release.html_url)
    }
  } else if (!quiet) {
    dialog.showMessageBox({ type: 'info', message: `txt-notes ${current} is the latest version.` })
  }
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

async function createWindow () {
  // dynamic import on modules that don't support commonjs
  const { default: contextMenu } = await import('electron-context-menu')

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
    titleBarStyle: 'hiddenInset',
    title: appTitle,
    backgroundColor: windowBackground(),
    show: false
  })

  // show once drawn, and prevent tests from stealing focus
  mainWindow.once('ready-to-show', () => isTest ? mainWindow.showInactive() : mainWindow.show())

  // keep the window title under the app's control rather than the page's
  mainWindow.on('page-title-updated', event => event.preventDefault())

  // and load the main entrypoint (main.html)
  mainWindow.loadFile('./templates/main.html')

  // never let links in notes navigate the app window away
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openExternalLink(url)
  })

  // deny any attempts to open extra windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url)
    return { action: 'deny' }
  })

  // Create the menu
  require('./menu.js')(mainWindow, { checkForUpdates, setAppearance })

  // keep the window background in step with the appearance, including system changes
  nativeTheme.on('updated', () => mainWindow?.setBackgroundColor(windowBackground()))

  // quietly check for a newer release when running a packaged build
  if (!isDev) {
    checkForUpdates(true)
  }

  mainWindowState.manage(mainWindow)

  // remember what was right clicked so the context menu can show the right items
  ipc.handle('elementIsFile', (event, isFile, isFileList, isPinned) => {
    elementIsFile = isFile
    elementIsFileList = isFileList
    elementIsPinned = isPinned
  })

  // Setup the context menu
  contextMenu({
    prepend: (defaultActions, params, browserWindow) => [
      {
        label: 'New File…',
        visible: elementIsFileList || elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'newFile')
      },
      defaultActions.separator(),
      {
        label: elementIsPinned ? 'Unpin' : 'Pin',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'togglePin')
      },
      defaultActions.separator(),
      {
        label: { darwin: 'Show in Finder', win32: 'Show in File Explorer' }[process.platform] || 'Open Containing Folder',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'showInFolder')
      },
      {
        label: 'Export As…',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'exportNote')
      },
      {
        label: 'Copy Name',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'copyFileName')
      },
      defaultActions.separator(),
      {
        label: 'Rename…',
        visible: elementIsFile,
        click: () => mainWindow.webContents.send('ping', 'renameFile')
      },
      {
        label: 'Delete',
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
