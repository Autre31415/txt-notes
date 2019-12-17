(() => {
  const Split = require('split.js')
  const moment = require('moment')
  const klawSync = require('klaw-sync')
  const path = require('path')
  const { clipboard, ipcRenderer, remote } = require('electron')
  const { dialog } = remote
  const fs = require('fs-extra')
  const contextMenu = require('electron-context-menu')
  const chokidar = require('chokidar')
  const teddy = require('teddy')
  const main = document.getElementsByTagName('main')[0]
  const Store = require('electron-store')
  const store = new Store()
  let isDev
  let baseDir = store.get('baseDir')
  let rightClickCache
  let lockSelection
  let currentFile
  let addingFile
  let txtFiles = []

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
      this.name = file.innerHTML + '.txt'
      this.content = fs.readFileSync(path.join(baseDir, this.name), 'utf8')
      this.modifyDate = fs.statSync(path.join(baseDir, this.name)).mtimeMs
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
    }

    /**
     * Set a new last modified time for file
     * @param {string} newDate - Unix datestamp
     */
    setModifyDate (newDate) {
      this.modifyDate = newDate
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
  try {
    isDev = require('electron-is-dev')

    if (isDev) {
      fs.ensureDirSync(('./tmp'))
      baseDir = './tmp'
    }
  } catch (err) {}

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
      startApp()
    }
  }

  /**
   * If no base directory is selected then start the app as a directory picker
   */
  function startAppBaseForm () {
    // clear caches
    main.innerHTML = ''
    txtFiles = []
    rightClickCache = null
    currentFile = null

    const template = fs.readFileSync(path.join(__dirname, 'templates/firstLoad.html'), 'utf8')
    const compiledTemplate = teddy.render(template)
    main.innerHTML = compiledTemplate

    const dirPicker = document.getElementById('dirPicker')

    dirPicker.addEventListener('click', chooseDirHandler)

    /**
     * Event handler for directory picker button
     */
    function chooseDirHandler () {
      dialog.showOpenDialog({
        properties: ['openDirectory']
      }).then(result => {
        if (result.filePaths[0]) {
          const selectedBaseDir = result.filePaths[0]

          store.set('baseDir', selectedBaseDir)
          baseDir = selectedBaseDir

          startApp()
        }
      })
    }
  }

  /**
   * Start up the app using the selected base directory
   */
  function startApp () {
    const template = fs.readFileSync(path.join(__dirname, 'templates/noteViewer.html'), 'utf8')
    const model = {}
    let newTemplate
    let fileList
    let fileViewer
    let lastModified
    let fileNameContainer

    // hook up Electron context menu
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

    main.innerHTML = ''

    // listen for main process close trigger
    ipcRenderer.on('ping', (event, message) => {
      if (message === 'confirmClose') {
        confirmClose()
      }
    })

    /**
     * Event handler for closing out the app
     */
    function confirmClose () {
      if (currentFile) {
        if (!currentFile.element.className.includes('edited')) {
          remote.app.exit()
        }

        dialog.showMessageBox({
          type: 'question',
          title: 'Confirm',
          buttons: ['Yes', 'No', 'Cancel'],
          message: `Would you like to save ${currentFile.name} before closing?`
        }).then(result => {
          if (result.response === 0) { // yes
            saveFile()
            remote.app.exit()
          } else if (result.response === 2) { // cancel
            return false
          } else {
            remote.app.exit()
          }
        })
      } else {
        remote.app.exit()
      }
    }

    // Spin up the view
    initView()

    /**
     * Initialize main app view
     */
    function initView () {
      let editedFileCache

      if (currentFile && currentFile.edited) {
        editedFileCache = fileViewer.value
      }

      // clear caches
      main.innerHTML = ''
      txtFiles = []
      rightClickCache = null

      // kick back to directory picker form if base directory doesn't exist
      if (!fileExists(baseDir)) {
        startAppBaseForm()
        return
      }

      // read all txt files in chosen directory
      klawSync(baseDir, { depthLimit: 0 }).forEach(file => {
        if (file.path.includes('.txt')) {
          // chop off the .txt for the view
          const fileName = path.basename(file.path).slice(0, -4)
          txtFiles.push({
            name: fileName,
            dateCode: file.stats.mtimeMs,
            dateString: file.stats.mtime
          })
        }
      })

      // sort files by modified date
      txtFiles.sort(sortByDate)

      // store contents of files in model and render template with it
      model.txtFiles = txtFiles
      newTemplate = teddy.render(template, model)
      main.innerHTML = newTemplate

      // grab a reference to file list and text area
      fileList = document.querySelectorAll('#fileNames li')
      fileViewer = document.querySelector('#txtFileView textarea')
      lastModified = document.getElementById('lastModified')
      fileNameContainer = document.getElementById('fileNames')

      // handle a refresh while a file is selected
      if (currentFile) {
        // if a file was being edited before a refresh it needs to start out selected
        if (currentFile.edited) {
          for (const file of fileList) {
            if (file.innerHTML === currentFile.element.innerHTML) {
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
            if (file.innerHTML === currentFile.element.innerHTML) {
              fileViewer.value = currentFile.content
              currentFile.setElement(file)
              currentFile.element.classList.add('highlight')
              updateLastModified()
              break
            }
          }
        }
      }

      // grab a reference to add/remove buttons
      const addButton = document.getElementById('addFile')
      const removeButton = document.getElementById('removeFile')
      const saveButton = document.getElementById('saveFile')
      const refreshButton = document.getElementById('refreshButton')
      const baseDirButton = document.getElementById('changeBaseDir')

      // bind click handlers to each file in the list
      fileList.forEach(fileName => {
        fileName.addEventListener('click', fileClickHandler)
      })

      // create the split pane view
      Split(['#txtFileList', '#txtFileView'], {
        sizes: [15, 85],
        gutterSize: 2,
        snapOffset: 0
      })

      // bind event listeners for saving/editing in text area
      fileViewer.addEventListener('keydown', fileSaveHandler)
      fileViewer.addEventListener('input', fileEditHandler)

      // bind click handlers to buttons
      removeButton.addEventListener('click', removeHandler)
      addButton.addEventListener('click', addHandler)
      saveButton.addEventListener('click', saveButtonHandler)
      refreshButton.addEventListener('click', refreshButtonHandler)
      baseDirButton.addEventListener('click', baseDirHandler)

      // bind event listener for arrow file navigation
      window.addEventListener('keydown', keySelectionHandler)

      // select last opened file before close if one exists
      if (store.get('lastFile')) {
        const lastFileInnerText = store.get('lastFile').slice(0, -4)
        let found

        for (const file of fileList) {
          if (file.innerHTML === lastFileInnerText) {
            file.click()
            found = true
          }
        }

        // if last selected file doesn't exist, remove record of it
        if (!found) {
          store.delete('lastFile')
        }
      }

      // watch for file changes in base directory
      const watcher = chokidar.watch(baseDir, {
        ignored: /(^|[/\\])\../,
        ignoreInitial: true
      })

      watcher
        .on('add', file => {
          if (path.extname(file) === '.txt') {
            initView()
          }
        })
        .on('unlink', file => {
          if (path.extname(file) === '.txt') {
            initView()
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
     * Save changes to file
     */
    function saveFile () {
      currentFile.setContent(fileViewer.value)
      currentFile.setModifyDate(moment().valueOf())
      fs.writeFileSync(path.join(baseDir, currentFile.name), fileViewer.value)
      currentFile.element.remove()
      fileNameContainer.insertBefore(currentFile.element, fileNameContainer.firstChild)
      updateLastModified()
      currentFile.setEdited(false)
      currentFile.element.classList.remove('edited')
    }

    /**
     * Update last modified field
     */
    function updateLastModified () {
      lastModified.innerHTML = moment(currentFile.modifyDate).format('MMMM D, YYYY, h:mm a')
    }

    /**
     * Event listeners
     */

    /**
     * Event handler for clicking a file in the list
     * @param {object} event - Click event
     */
    function fileClickHandler (event) {
      let element

      if (!lockSelection && (!currentFile || `${currentFile.name}.txt` !== `${event.target.innerHTML}.txt`)) {
        element = event.target

        // bring up save dialog when navigating away from edited file
        if (currentFile && currentFile.element.className.includes('edited')) {
          dialog.showMessageBox({
            type: 'question',
            buttons: ['No', 'Yes'],
            message: `Would you like to save ${currentFile.name}?`
          }).then(result => {
            if (result.response === 1) {
              saveFile()
              fileSelection()
            } else {
              fileSelection()
            }
          })
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
     * Event handler for keyboard shortcuts in main text editor
     * @param {object} event - Keydown event
     */
    function fileSaveHandler (event) {
      if (event.metaKey && event.key === 's') {
        // only init save when the file was edited
        if (currentFile.element.className.includes('edited')) {
          saveFile()
        }
      }
    }

    /**
     * Event handler for clicking save file button
     */
    function saveButtonHandler () {
      if (currentFile && currentFile.element.className.includes('edited')) {
        saveFile()
      }
    }

    /**
     * Event handler for clicking add file button
     */
    function addHandler () {
      // track if a file name input already exists and disable the button if so
      if (addingFile) {
        return
      }

      addingFile = true

      const lineItem = document.createElement('li')
      const newFileInput = document.createElement('input')

      lockSelection = true

      newFileInput.setAttribute('type', 'text')
      newFileInput.classList.add('fileNameEdit')

      lineItem.appendChild(newFileInput)
      lineItem.addEventListener('click', fileClickHandler)

      fileNameContainer.insertBefore(lineItem, fileNameContainer.firstChild)

      newFileInput.focus()

      newFileInput.addEventListener('input', fileNameValidation)
      newFileInput.addEventListener('keyup', event => {
        const key = event.key

        if (event.target.value.trim() === '') {
          event.target.setCustomValidity('Please enter a file name')
        }

        if (key === 'Enter' && event.target.checkValidity()) {
          event.preventDefault()

          const newFileValue = newFileInput.value
          const newFileName = newFileValue + '.txt'
          newFileInput.remove()
          lineItem.classList.add('fileName')
          lineItem.innerHTML = newFileValue

          fs.openSync(path.join(baseDir, newFileName), 'a')

          lockSelection = false

          lineItem.click()

          /*
          * For some reason the text editor for a new file is losing focus immediately after gaining it
          * TODO: Find a better way to fix this
          */
          setTimeout(() => {
            fileViewer.focus()
          }, 100)

          addingFile = false
        } else if (key === 'Escape') {
          event.preventDefault()

          lockSelection = false
          lineItem.remove()
          addingFile = false
        }
      })
    }

    /**
     * Event handler for clicking remove file button
     */
    function removeHandler () {
      if (rightClickCache || currentFile) {
        const elementToDelete = rightClickCache || currentFile.element
        const selectedFileName = elementToDelete.innerHTML + '.txt'

        dialog.showMessageBox({
          type: 'question',
          buttons: ['No', 'Yes'],
          message: `Are you sure you want to delete ${selectedFileName}?`
        }).then(result => {
          if (result.response === 1) {
            elementToDelete.remove()
            if (elementToDelete === currentFile.element) {
              fileViewer.value = ''
              lastModified.innerHTML = ''
              currentFile = null
            }
            fs.unlinkSync(path.join(baseDir, selectedFileName))
          }
        })
      }
    }

    /**
     * Event handler for clicking refresh button
     */
    function refreshButtonHandler () {
      initView()
    }

    /**
     * Event handler for clicking change directory button
     */
    function baseDirHandler () {
      dialog.showOpenDialog({
        properties: ['openDirectory']
      }).then(result => {
        if (result.filePaths[0]) {
          const selectedBaseDir = result.filePaths[0]

          store.set('baseDir', selectedBaseDir)
          baseDir = selectedBaseDir
          currentFile = null

          initView()
        }
      })
    }

    /**
     * Event handler for clicking copy file name context menu item
     */
    function copyFileNameHandler () {
      if (rightClickCache) {
        clipboard.writeText(rightClickCache.innerHTML)

        rightClickCache = null
      }
    }

    /**
     * Event handler for clicking rename file context menu item
     */
    function renameFileHandler () {
      const element = rightClickCache
      const oldFileName = element.innerHTML + '.txt'
      const fileRenameInput = document.createElement('input')

      lockSelection = true

      fileRenameInput.setAttribute('type', 'text')
      fileRenameInput.classList.add('fileNameEdit')
      fileRenameInput.value = element.innerHTML

      element.innerHTML = ''

      element.appendChild(fileRenameInput)

      fileRenameInput.focus()

      fileRenameInput.addEventListener('keydown', renameConfirmHandler)
      fileRenameInput.addEventListener('input', renameValidation)

      /**
       * Event handler for confirming or canceling file rename
       * @param {object} event - Keydown event
       */
      function renameConfirmHandler (event) {
        const key = event.key
        const newFileName = event.target.value + '.txt'

        if (key === 'Enter' && event.target.checkValidity()) {
          const nowTime = moment().unix()

          // rename the file
          fs.renameSync(path.join(baseDir, oldFileName), path.join(baseDir, newFileName))
          fs.utimesSync(path.join(baseDir, newFileName), nowTime, nowTime)
          event.target.remove()
          element.innerHTML = newFileName.slice(0, -4)

          lockSelection = false

          element.click()
          currentFile.setModifyDate(moment().valueOf())
          currentFile.element.remove()
          fileNameContainer.insertBefore(currentFile.element, fileNameContainer.firstChild)
          updateLastModified()
        } else if (key === 'Escape') {
          event.target.remove()
          element.innerHTML = oldFileName.slice(0, -4)
          lockSelection = false
        }
      }

      /**
       * Event handler for file name validation
       * @param {object} event - Input event
       */
      function renameValidation (event) {
        fileNameValidation(event, oldFileName.slice(0, -4))
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
      if (currentFile && event.target.tagName !== 'TEXTAREA') {
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
  }

  /**
   * Helper functions
   */

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
   * @returns {boolean} - If element is the file list
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
