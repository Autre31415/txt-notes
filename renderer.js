(() => {
  const Split = require('split.js')
  const chokidar = require('chokidar')
  const dayjs = require('dayjs')
  const klawSync = require('klaw-sync')
  const path = require('path')
  const { clipboard, ipcRenderer } = require('electron')
  const fs = require('fs-extra')
  const contextMenu = require('electron-context-menu')
  const teddy = require('teddy')
  const main = document.getElementsByTagName('main')[0]
  const Store = require('electron-store')
  const store = new Store()
  let baseDir = store.get('baseDir')

  // directory picker template
  const dirPickerTemplate = fs.readFileSync(path.join(__dirname, 'templates/firstLoad.html'), 'utf8')

  // main note viewer template
  const mainTemplate = fs.readFileSync(path.join(__dirname, 'templates/noteViewer.html'), 'utf8')

  // note list partial template
  const noteListTemplate = fs.readFileSync(path.join(__dirname, 'templates/noteList.html'), 'utf8')

  // pre-compile noteList template
  teddy.setTemplate('noteList.html', teddy.compile(noteListTemplate))

  // file currently being right clicked
  let rightClickCache

  // when in file rename mode lock ability to select other files
  let lockSelection

  // side panel that includes all the file names
  let fileNameContainer

  // array of elements that refer to file names
  let fileList

  // main text editor
  let fileViewer

  // last modified field above the text editor
  let lastModified

  // current selected file
  let currentFile

  // app state when new file name is being typed
  let addingFile

  // search input
  let searchInput

  // array of txt files that meet search criteria
  let searchFiles = []

  // array of txt files in watched folder
  let txtFiles = []

  // chokidar directory scanner instance
  let watcher

  // hook up the context menu
  contextMenu({
    prepend: (defaultActions, params, browserWindow) => [
      {
        label: 'Copy File Name',
        visible: elementIsFile(params.x, params.y),
        click: copyFileNameHandler
      },
      {
        label: 'New File',
        visible: elementIsFileList(params.x, params.y),
        click: addHandler
      },
      {
        label: 'Rename File',
        visible: elementIsFile(params.x, params.y),
        click: renameFileHandler
      },
      {
        label: 'Delete File',
        visible: elementIsFile(params.x, params.y),
        click: removeHandler
      }
    ]
  })

  // listen for main process close trigger
  ipcRenderer.on('ping', (event, message) => {
    if (message === 'confirmClose') {
      confirmClose()
    } else if (message === 'save') {
      // only init save when the file was edited
      if (currentFile.edited) {
        saveFile()
      }
    }
  })

  /**
   * Class representing the currently selected file
   */
  class SelectedFile {
    /**
     * Initialize file selection
     * @param {object} file - Element representing a file
     */
    constructor (file) {
      this.element = file
      this.name = file.textContent + '.txt'
      this.content = txtFiles.find(item => item.fileName === this.name).content
      this.modifyDate = txtFiles.find(item => item.fileName === this.name).dateCode
      this.edited = false

      // save reference to newly selected file
      store.set('lastFile', this.name)
    }

    /**
     * Set a new element to represent selected file
     * @param {object} element - Element representing a file
     */
    setElement (element) {
      this.element = element
    }

    /**
     * Set a new representation of file content
     * @param {string} newContent - The new file content
     */
    setContent (newContent) {
      this.content = newContent
      txtFiles.find(item => item.fileName === this.name).content = newContent
    }

    /**
     * Set a new last modified time for file
     * @param {string} newDate - Unix datestamp
     */
    setModifyDate (newDate) {
      this.modifyDate = newDate
      txtFiles.find(item => item.fileName === this.name).dateCode = newDate
    }

    /**
     * Set editing status of file
     * @param {boolean} param - Whether or not there is file editing in progress
     */
    setEdited (param) {
      this.edited = param
    }
  }

  // set baseDir to local directory in dev mode
  const isDev = process.argv.includes('ELECTRON_IS_DEV')

  if (isDev) {
    fs.ensureDirSync(('./tmp'))
    baseDir = './tmp'
  }

  // handle click events
  window.addEventListener('click', event => {
    // file in the list
    if (event.target.className.includes('fileName')) {
      fileClickHandler(event)
    } else {
      switch (event.target.id) {
        // initial directory picker button
        case 'dirPicker':
          baseDirHandler()
          break

        // add file button
        case 'addFile':
          clearSearch()
          addHandler()
          break

        // remove file button
        case 'removeFile':
          removeHandler()
          break

        // save file button
        case 'saveFile':
          saveButtonHandler()
          break

        // refresh button
        case 'refreshButton':
          clearSearch()
          refreshButtonHandler()
          break

        // change directory button
        case 'changeBaseDir':
          clearSearch()
          baseDirHandler()
          break
      }
    }
  })

  // bind event listeners for editing textarea
  window.addEventListener('input', event => {
    if (event.target.id === 'fileEditor') {
      fileEditHandler(event)
    }
  })

  // bind event listener for arrow file navigation
  window.addEventListener('keydown', keySelectionHandler)

  // entry point
  configCheck()

  /**
   * Check if a base directory has been selected before starting the app
   */
  function configCheck () {
    // first check if there's a configured baseDir
    if (!baseDir) {
      startAppBaseForm()
    } else {
      initView()
    }
  }

  /**
   * Directory picker form view
   */
  function startAppBaseForm () {
    // clear caches
    main.innerHTML = ''
    txtFiles = []
    searchFiles = []
    rightClickCache = null
    currentFile = null
    fileNameContainer = null
    fileList = null
    fileViewer = null
    lastModified = null

    const compiledTemplate = teddy.render(dirPickerTemplate)
    main.innerHTML = compiledTemplate
  }

  /**
   * Main application view
   */
  function initView () {
    const model = {}

    // clear caches
    currentFile = null
    main.innerHTML = ''
    rightClickCache = null

    // kick back to directory picker form if base directory doesn't exist
    if (!fileExists(baseDir)) {
      startAppBaseForm()
      return
    }

    // build list of notes in base directory
    txtFiles = gatherNotes()

    // store contents of files in model and render template with it
    model.txtFiles = txtFiles
    const newTemplate = teddy.render(mainTemplate, model)
    main.innerHTML = newTemplate

    // style main navigation based on platform
    const mainNav = document.querySelector('nav')
    if (process.platform === 'darwin') {
      mainNav.classList.add('darwin-nav')
    }

    // grab a reference to file list and text area
    fileList = document.querySelectorAll('#fileNames li')
    fileViewer = document.querySelector('#fileEditor')
    lastModified = document.getElementById('lastModified')
    fileNameContainer = document.getElementById('fileNames')
    searchInput = document.getElementById('search')

    // create the split pane view
    Split(['#txtFileList', '#txtFileView'], {
      sizes: [15, 85],
      gutterSize: 2,
      snapOffset: 0
    })

    // select last opened file before close if one exists
    if (store.get('lastFile')) {
      const lastFileInnerText = store.get('lastFile').slice(0, -4)

      selectFile(lastFileInnerText)

      store.delete('lastFile')
    }

    // bind event listener to search input
    searchInput.addEventListener('input', debounce(searchHandler, 200))

    // watch for file changes in base directory
    watcher = chokidar.watch(baseDir, {
      ignored: /(^|[/\\])\../,
      ignoreInitial: true,
      depth: 0
    })

    watcher
      .on('add', (file) => {
        // only trigger for txt files not in the note list
        if (path.extname(file) === '.txt' && !txtFiles.find(item => item.fileName === path.basename(file))) {
          addNote(file)

          // reload file list
          reloadFileList(txtFiles)
        }
      })
      .on('unlink', file => {
        // only trigger for txt files in the note list
        if (path.extname(file) === '.txt' && txtFiles.find(item => item.fileName === path.basename(file))) {
          removeNote(file)

          // reload file list
          reloadFileList(txtFiles)
        }
      })
      .on('unlinkDir', file => {
        if (file === baseDir) {
          watcher.close()
          startAppBaseForm()
        }
      })
  }

  /**
   * Event handler for typing into the search field
   * @param {object} event - Input event
   */
  async function searchHandler (event) {
    let input = event.target.value

    // clear searchFiles global
    searchFiles = []

    if (input) {
      input = input.toLowerCase()

      for (const txt of txtFiles) {
        // search name and file content
        if (txt.name.toLowerCase().includes(input) || txt.content.toLowerCase().includes(input)) {
          searchFiles.push(txt)
        }
      }

      // spin up a save confirmation if a file is being edited
      if (currentFile && currentFile.edited) {
        const result = await ipcRenderer.invoke('confirmNavigateAway', currentFile.name)

        if (result.response === 1) {
          saveFile()
          clearSelection()
          reloadFileList(searchFiles)
        } else {
          clearSelection()
          reloadFileList(searchFiles)
        }
      } else {
        reloadFileList(searchFiles)
      }
    } else {
      reloadFileList(txtFiles)
    }
  }

  /**
   * Event handler for add file button or context menu item
   */
  function addHandler () {
    // track if a file name input already exists and disable the button if so
    if (addingFile) {
      return
    }

    // set app state to adding mode
    addingFile = true

    // prevent files from being selected while a new one is being generated
    lockSelection = true

    // create a form input, add it to the top of the file list, and give it focus
    const lineItem = document.createElement('li')
    const newFileInput = document.createElement('input')
    newFileInput.setAttribute('type', 'text')
    newFileInput.classList.add('fileNameEdit')
    lineItem.appendChild(newFileInput)
    fileNameContainer.insertBefore(lineItem, fileNameContainer.firstChild)
    newFileInput.focus()

    // fade out the text of surrounding elements
    fileNameContainer.classList.add('renaming')

    // bind a click event to the entire file pane
    fileNameContainer.parentNode.addEventListener('click', clickAwayAdd)

    // bind event listeners to the file name input
    newFileInput.addEventListener('input', fileNameValidation)
    newFileInput.addEventListener('keyup', event => {
      const key = event.key

      if (event.target.value.trim() === '') {
        event.target.setCustomValidity('Please enter a file name')
      }

      // enter key indicates finished name
      if (key === 'Enter' && event.target.checkValidity()) {
        event.preventDefault()

        // set the new file name based on user input
        const newFileValue = newFileInput.value
        const newFileName = newFileValue + '.txt'
        const newFilePath = path.join(baseDir, newFileName)

        // remove the input field and replace it with the file name
        newFileInput.remove()
        lineItem.classList.add('fileName')
        lineItem.innerHTML = newFileValue

        // create the new file
        fs.openSync(newFilePath, 'a')

        // allow files to be selected again
        lockSelection = false

        // add the note to the global list
        addNote(newFilePath)

        // reload the list
        reloadFileList(txtFiles)

        // remove adding file state
        addingFile = false

        // select the new file and focus on the text editor
        selectFile(newFileValue)
        fileViewer.focus()
      } else if (key === 'Escape') {
        // escape key indicates backing out of new file operation
        event.preventDefault()

        escapeAdd()
      }
    })

    /**
     * Event handler for clicking out of add operation
     * @param {object} event - Click event
     */
    function clickAwayAdd (event) {
      // exit add mode when clicking out of the input
      if (event.target !== newFileInput) {
        escapeAdd()
      }
    }

    /**
     * Cancel file creation in progress
     */
    function escapeAdd () {
      lockSelection = false
      lineItem.remove()
      fileNameContainer.classList.remove('renaming')
      addingFile = false
    }
  }

  /**
   * Event handler for clicking a file in the list
   * @param {object} event - Click event
   */
  async function fileClickHandler (event) {
    const element = event.target
    if (!lockSelection && (!currentFile || currentFile.name !== `${element.textContent}.txt`)) {
      // bring up save dialog when navigating away from edited file
      if (currentFile && currentFile.edited) {
        // spin up confirmation dialog
        const result = await ipcRenderer.invoke('confirmNavigateAway', currentFile.name)

        if (result.response === 1) {
          saveFile()
          fileSelection()
        } else {
          fileSelection()
        }
      } else {
        fileSelection()
      }
    }

    /**
     * Highlight selected file and remove highlight from other files
     */
    function fileSelection () {
      // highlight selection
      element.classList.add('highlight')

      // remove highlighting from previous selection
      if (currentFile && currentFile.element !== event.target) {
        currentFile.element.classList.remove('highlight')
        currentFile.element.classList.remove('edited')
      }

      // store data about selected file
      currentFile = new SelectedFile(element)

      // populate modifiedDate field
      lastModified.removeAttribute('hidden')
      updateLastModified()

      // populate text editor with file content
      fileViewer.value = currentFile.content
    }
  }

  /**
   * Select a file in the list by name
   * @param {string} name - File name to select
   */
  function selectFile (name) {
    for (const file of fileList) {
      if (file.textContent === name) {
        file.click()
        break
      }
    }
  }

  /**
   * Remove highlighting from currently selected file and clear caches
   */
  function clearSelection () {
    if (currentFile) {
      currentFile.element.classList.remove('highlight')
      currentFile.element.classList.remove('edited')
    }

    currentFile = null
    lastModified.innerHTML = ''
    fileViewer.value = ''
  }

  /**
   * Event handler for typing in main text editor
   * @param {object} event - Input event
   */
  function fileEditHandler (event) {
    // if file was edited
    if (event.target.value !== currentFile.content) {
      // indicate the file is being edited
      if (!currentFile.edited) {
        currentFile.setEdited(true)
        currentFile.element.classList.add('edited')
      }
    } else {
      currentFile.element.classList.remove('edited')
      currentFile.setEdited(false)
    }
  }

  /**
   * Event handler for clicking save file button
   */
  function saveButtonHandler () {
    if (currentFile && currentFile.edited) {
      saveFile()
    }
  }

  /**
   * Event handler for clicking remove file button
   */
  async function removeHandler () {
    if (rightClickCache || currentFile) {
      const elementToDelete = rightClickCache || currentFile.element
      const selectedFileName = elementToDelete.textContent + '.txt'
      const result = await ipcRenderer.invoke('removeHandler', selectedFileName)

      if (result.response === 1) {
        const file = path.join(baseDir, selectedFileName)
        removeNote(file)
        elementToDelete.remove()
        fs.unlinkSync(file)
      }
    }
  }

  /**
   * Event handler for clicking refresh button
   */
  function refreshButtonHandler () {
    reloadFileList(txtFiles)
  }

  /**
   * Event handler for clicking change directory button
   */
  async function baseDirHandler () {
    const result = await ipcRenderer.invoke('directoryPicker')

    if (result.filePaths[0]) {
      const selectedBaseDir = result.filePaths[0]

      store.set('baseDir', selectedBaseDir)
      baseDir = selectedBaseDir

      initView()
    }
  }

  /**
   * Event handler for clicking copy file name context menu item
   */
  function copyFileNameHandler () {
    if (rightClickCache) {
      clipboard.writeText(rightClickCache.textContent)

      rightClickCache = null
    }
  }

  /**
   * Event handler for clicking rename file context menu item
   */
  function renameFileHandler () {
    // get the element from the cache
    const element = rightClickCache
    const oldFileName = element.textContent + '.txt'

    // create an input populated with the current file name and give it focus
    const fileRenameInput = document.createElement('input')
    fileRenameInput.setAttribute('type', 'text')
    fileRenameInput.classList.add('fileNameEdit')
    fileRenameInput.value = element.textContent
    element.innerHTML = ''
    element.classList.remove('highlight')
    element.appendChild(fileRenameInput)
    fileRenameInput.focus()
    fileRenameInput.select()

    // lock ability to select other files while input is displayed
    lockSelection = true

    // attach some event listeners to the rename input
    fileRenameInput.addEventListener('keydown', renameConfirmHandler)
    fileRenameInput.addEventListener('input', renameValidation)

    // fade out the text of surrounding elements
    fileNameContainer.classList.add('renaming')

    // bind a click event to the entire file pane
    fileNameContainer.parentNode.addEventListener('click', clickAwayRename)

    /**
     * Event handler for confirming or canceling file rename
     * @param {object} event - Keydown event
     */
    function renameConfirmHandler (event) {
      const key = event.key
      const newFileName = event.target.value + '.txt'

      if (key === 'Enter' && event.target.checkValidity()) {
        const nowTime = dayjs().valueOf()

        // update note in the list
        renameNote(oldFileName, newFileName, nowTime)

        // rename the file itself
        fs.renameSync(path.join(baseDir, oldFileName), path.join(baseDir, newFileName))

        // update file modified time
        fs.utimesSync(path.join(baseDir, newFileName), nowTime, nowTime)

        // remove the input element
        event.target.remove()

        // set right clicked element to new file name
        element.textContent = newFileName.slice(0, -4)

        // unlock file selection
        lockSelection = false

        // select the updated note
        element.click()

        // bring note element back
        fileNameContainer.insertBefore(currentFile.element, fileNameContainer.firstChild)

        updateLastModified()
      } else if (key === 'Escape') {
        escapeEdit()
      }
    }

    /**
     * Event handler for clicking out of rename operation
     * @param {object} event - Click event
     */
    function clickAwayRename (event) {
      // exit edit mode when clicking out of the input
      if (event.target !== fileRenameInput) {
        escapeEdit()
      }
    }

    /**
     * Event handler for file name validation
     * @param {object} event - Input event
     */
    function renameValidation (event) {
      fileNameValidation(event, oldFileName.slice(0, -4))
    }

    /**
     * Cancel file rename in progress
     */
    function escapeEdit () {
      fileRenameInput.remove()
      element.textContent = oldFileName.slice(0, -4)
      fileNameContainer.classList.remove('renaming')
      fileNameContainer.parentNode.removeEventListener('click', clickAwayRename)
      lockSelection = false
    }
  }

  /**
   * Event handler for file name validation
   * @param {object} event - Key event
   * @param {string} oldFileName - If renaming a file, the original name is valid
   */
  function fileNameValidation (event, oldFileName) {
    const input = event.target
    const possibleFileName = input.value + '.txt'
    const possiblePath = path.join(baseDir, possibleFileName)
    let valid = true

    // ensure file name isn't blank
    if (input.value.trim() === '') {
      input.setCustomValidity('Please enter a file name')
      valid = false
    }

    // ensure file name doesn't match another file
    if (input.value !== oldFileName) {
      if (fileExists(possiblePath)) {
        input.setCustomValidity('This file matches another file')
        valid = false
      }
    }

    // ensure file name doesn't include invalid character
    if (/[<>:"/\\|?*]/.test(input.value)) {
      input.setCustomValidity('This name includes an illegal character')
      valid = false
    }

    if (valid) {
      input.setCustomValidity('')
    }
  }

  /**
   * Event handler for arrow key navigation of file list
   * @param {object} event - Keydown event
   */
  function keySelectionHandler (event) {
    if (currentFile && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'INPUT') {
      const element = currentFile.element
      const next = element.nextElementSibling
      const prev = element.previousElementSibling

      if (event.key === 'ArrowDown' && next && next.tagName === 'LI') {
        event.preventDefault()
        next.scrollIntoView({ block: 'nearest' })
        next.click()
      } else if (event.key === 'ArrowUp' && prev && prev.tagName === 'LI') {
        event.preventDefault()
        prev.scrollIntoView({ block: 'nearest' })
        prev.click()
      } else if (event.key === 'ArrowRight') {
        fileViewer.focus()
        fileViewer.setSelectionRange(fileViewer.value.length, fileViewer.value.length)
      }
    }
  }

  /**
   * Event handler for closing out the app
   */
  async function confirmClose () {
    if (currentFile) {
      // exit without intervention when no files are edited and unsaved
      if (!currentFile.edited) {
        await ipcRenderer.invoke('exit')
      }

      // tell the main process to spin up a confirmation dialog
      const result = await ipcRenderer.invoke('confirmClose', currentFile.name)

      if (result.response === 0) { // yes
        saveFile()
        await ipcRenderer.invoke('exit')
      } else if (result.response === 2) { // cancel
        return false
      } else {
        await ipcRenderer.invoke('exit')
      }
    } else {
      await ipcRenderer.invoke('exit')
    }
  }

  /**
   * Scan the notes directory and return a master list of notes
   * @returns {array} - List of notes
   */
  function gatherNotes () {
    const txtFiles = []

    // read all txt files in chosen directory
    klawSync(baseDir, { depthLimit: 0 }).forEach(file => {
      if (file.path.includes('.txt')) {
        const fileName = path.basename(file.path)

        txtFiles.push({
          fileName: fileName,
          name: fileName.slice(0, -4), // file name with .txt chopped off
          dateCode: file.stats.mtimeMs,
          content: fs.readFileSync(file.path, 'utf8')
        })
      }
    })

    // sort files by modified date
    txtFiles.sort(sortByDate)

    return txtFiles
  }

  /**
   * Add a new note to the master notes list
   * @param {string} path - Path to new note file
   */
  function addNote (file) {
    const fileName = path.basename(file)

    // ensure this is a new note
    if (!txtFiles.find(item => item.fileName === fileName)) {
      const stats = fs.statSync(file)

      // add file to master note list
      txtFiles.push({
        fileName: fileName,
        name: fileName.slice(0, -4), // file name with .txt chopped off
        dateCode: stats.mtimeMs,
        content: fs.readFileSync(file, 'utf8')
      })

      // sort files by modified date
      txtFiles.sort(sortByDate)
    }
  }

  /**
   * Remove a note from the master notes list
   * @param {string} file - Path to note being removed
   */
  function removeNote (file) {
    const fileName = path.basename(file)
    const index = txtFiles.findIndex(item => item.fileName === fileName)

    if (index !== -1) {
      if (currentFile && fileName === currentFile.name) {
        currentFile = null
        lastModified.innerHTML = ''
        fileViewer.value = ''
      }

      txtFiles.splice(index, 1)
    }
  }

  /**
   * Rename and update modified time of a note in the master list
   * @param {string} oldFile - Name of the file being changed
   * @param {string} newFile - New file name
   * @param {string} time - Time to set modified time to
   */
  function renameNote (oldFile, newFile, time) {
    // look for the old note
    const index = txtFiles.findIndex(item => item.fileName === oldFile)

    // update note with new name and modified time
    if (index !== -1) {
      txtFiles[index].fileName = newFile
      txtFiles[index].name = newFile.slice(0, -4)
      txtFiles[index].dateCode = time
    }

    // sort files by modified date
    txtFiles.sort(sortByDate)
  }

  /**
   * Clear search form and files cache
   */
  function clearSearch () {
    searchFiles = []
    searchInput.value = ''
    reloadFileList(txtFiles)
  }

  /**
   * Perform a fresh render of the file list
   * @param {array} notes - List of notes to render
   */
  function reloadFileList (notes) {
    const model = {}
    let editedFileCache

    if (currentFile && currentFile.edited) {
      editedFileCache = fileViewer.value
    }

    // clear caches
    fileNameContainer.innerHTML = ''
    rightClickCache = null

    // sort notes by last modified
    notes.sort(sortByDate)

    // store contents of files in model and render template with it
    model.txtFiles = notes
    const newTemplate = teddy.render(noteListTemplate, model)
    fileNameContainer.innerHTML = newTemplate

    // get fresh reference to list of files
    fileList = document.querySelectorAll('#fileNames li')

    // handle a refresh while a file is selected
    if (currentFile) {
      // if a file was being edited before a refresh it needs to start out selected
      if (currentFile.edited) {
        for (const file of fileList) {
          if (file.textContent === currentFile.element.textContent) {
            currentFile.setElement(file)
            currentFile.element.classList.add('highlight')
            currentFile.element.classList.add('edited')
            updateLastModified()
            fileViewer.value = editedFileCache
            break
          }
        }
      } else {
        for (const file of fileList) {
          if (file.textContent === currentFile.element.textContent) {
            fileViewer.value = currentFile.content
            currentFile.setElement(file)
            currentFile.element.classList.add('highlight')
            updateLastModified()
            break
          }
        }
      }
    }
  }

  /**
   * Save changes to file
   */
  function saveFile () {
    // set in memory file content
    currentFile.setContent(fileViewer.value)

    // update last modified date
    currentFile.setModifyDate(dayjs().valueOf())

    // write new file data
    fs.writeFileSync(path.join(baseDir, currentFile.name), fileViewer.value)

    // run sort by modified date on master notes array
    txtFiles.sort(sortByDate)

    // move file to top of the list
    currentFile.element.remove()
    fileNameContainer.insertBefore(currentFile.element, fileNameContainer.firstChild)

    // update last modified time in ui
    updateLastModified()

    // remove edited status
    currentFile.setEdited(false)
    currentFile.element.classList.remove('edited')
  }

  /**
   * Update last modified field
   */
  function updateLastModified () {
    lastModified.innerHTML = dayjs(currentFile.modifyDate).format('MMMM D, YYYY, h:mm a')
  }

  /**
   * Determine if element is a file name by coordinate
   * @param {number} x - X axis coordinate of document
   * @param {number} y - Y axis coordinate of document
   * @returns {boolean} - If element is a file in the list
   */
  function elementIsFile (x, y) {
    const element = document.elementsFromPoint(x, y)[0]

    if (lockSelection) {
      return false
    }

    if (element.className.includes('fileName')) {
      rightClickCache = element
      return true
    } else {
      rightClickCache = null
      return false
    }
  }

  /**
   * Determine if element is inside the file list by coordinate
   * @param {number} x - X axis coordinate of document
   * @param {number} y - Y axis coordinate of document
   * @returns {boolean} - If element is the file list container
   */
  function elementIsFileList (x, y) {
    const elements = document.elementsFromPoint(x, y)

    for (const element of elements) {
      if (element.id === 'txtFileList') {
        return true
      }
    }

    return false
  }

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
   * Apply a delay to passed callback function
   * @param {function} callback - Function to delay
   * @param {number} delay - Number of ms to delay callback execution
   */
  function debounce (callback, delay) {
    let timeout
    return (...args) => {
      const context = this
      clearTimeout(timeout)
      timeout = setTimeout(() => callback.apply(context, args), delay)
    }
  }

  /**
   * Array comparison function that sorts array of files by date
   * @param {object} a - Array indice
   * @param {object} b - Array indice
   * @return {number} - Array sorting index
   */
  function sortByDate (a, b) {
    if (a.dateCode > b.dateCode) {
      return -1
    } else if (a.dateCode < b.dateCode) {
      return 1
    } else {
      return 0
    }
  }
})()
