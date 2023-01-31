process.once('loaded', () => {
  const { contextBridge, ipcRenderer: ipc } = require('electron')

  contextBridge.exposeInMainWorld('electron', {
    addNote: async (...params) => await ipc.invoke('addNote', ...params),
    confirmClose: async (...params) => await ipc.invoke('confirmClose', ...params),
    confirmNavigateAway: async (...params) => await ipc.invoke('confirmNavigateAway', ...params),
    directoryPicker: async () => await ipc.invoke('directoryPicker'),
    elementIsFile: async (...params) => await ipc.invoke('elementIsFile', ...params),
    exitApp: async () => await ipc.invoke('exit'),
    fileExists: async (...params) => await ipc.invoke('fileExists', ...params),
    gatherNotes: async (...params) => await ipc.invoke('gatherNotes', ...params),
    getNoteInfo: async (...params) => await ipc.invoke('getNoteInfo', ...params),
    initWatcher: async (...params) => await ipc.invoke('initWatcher', ...params),
    listen: callback => ipc.on('ping', callback),
    platform: async () => await ipc.invoke('platform'),
    printNote: async (...params) => await ipc.invoke('printNote', ...params),
    removeHandler: async (...params) => await ipc.invoke('removeHandler', ...params),
    renameHandler: async (...params) => await ipc.invoke('renameHandler', ...params),
    renderTemplate: async (...params) => await ipc.invoke('renderTemplate', ...params),
    storeGet: async (...params) => await ipc.invoke('storeGet', ...params),
    storeSet: (...params) => ipc.send('storeSet', ...params),
    updateNote: async (...params) => await ipc.invoke('updateNote', ...params),
    writeClipboard: async (...params) => await ipc.invoke('writeClipboard', ...params)
  })
})
