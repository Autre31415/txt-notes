const { app, Menu, nativeTheme } = require('electron')

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged

module.exports = (window, { checkForUpdates, setAppearance }) => {
  const template = [
    // { role: 'appMenu' }
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }]
      : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            window.webContents.send('ping', 'save')
          }
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            window.webContents.send('ping', 'print')
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [
                  { role: 'startspeaking' },
                  { role: 'stopspeaking' }
                ]
              }
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' }
            ]),
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => window.webContents.send('ping', 'find')
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => window.webContents.send('ping', 'findNext')
        },
        {
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => window.webContents.send('ping', 'findPrevious')
        }
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        // reloading discards unsaved edits without asking, so it's only offered in dev
        ...(isDev
          ? [
              { role: 'reload' },
              { role: 'forcereload' },
              { role: 'toggledevtools' },
              { type: 'separator' }
            ]
          : []),
        {
          label: 'Appearance',
          submenu: [['system', 'Match the system'], ['light', 'Light'], ['dark', 'Dark']].map(([appearance, label]) => ({
            label,
            type: 'radio',
            checked: nativeTheme.themeSource === appearance,
            click: () => setAppearance(appearance)
          }))
        },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' }
            ]
          : [
              { role: 'close' }
            ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/Autre31415/txt-notes')
          }
        },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates()
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
