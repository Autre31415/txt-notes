/* global dayjs */

import Split from './node_modules/split-grid/dist/split-grid.mjs'

(async () => {
  const electron = window.electron
  const main = document.getElementsByTagName('main')[0]

  // the root directory of notes
  let baseDir

  // file currently being right clicked
  let rightClickCache

  // when in file rename mode lock ability to select other files
  let lockSelection

  // side panel that includes all the file names
  let fileNameContainer

  // array of elements that refer to file names
  let fileList

  // title in main navigation
  let noteTitle

  // main text editor
  let fileViewer

  // last modified field above the text editor
  let lastModified

  // printable area
  let printArea

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

  // pull the baseDir from the store
  baseDir = await electron.storeGet('baseDir')

  // listen to events fired by the main process
  electron.listen(async (event, message, fileName) => {
    switch (message) {
      case 'confirmClose':
        await confirmClose()
        break
      case 'save':
        // only init save when the file was edited
        if (currentFile.edited) {
          await saveFile()
        }
        break
      case 'print':
        // only try printing when looking at a file
        if (currentFile) {
          // this nonsense is necessary because of https://stackoverflow.com/a/4611247
          // TODO: Consider replacing the textarea with a contenteditable element
          printArea.innerText = currentFile.content

          await electron.printNote()
        }
        break
      case 'copyFileName':
        await copyFileNameHandler()
        break
      case 'newFile':
        addHandler()
        break
      case 'renameFile':
        // spin up a save confirmation if the file to be renamed has unsaved changed
        if (currentFile && currentFile.edited) {
          const result = await electron.confirmNavigateAway(currentFile.name)

          if (result.response === 0) { // yes
            await saveFile()
            renameFileHandler()
          } else if (result.response === 2) { // cancel
            return false
          } else { // no
            clearSelection()
            renameFileHandler()
          }
        } else {
          renameFileHandler()
        }
        break
      case 'deleteFile':
        await removeHandler()
        break
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
      electron.storeSet('lastFile', this.name)
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

  // handle click events
  window.addEventListener('click', async event => {
    // file in the list
    if (event.target.className.includes('fileName')) {
      await fileClickHandler(event)
    } else {
      switch (event.target.id) {
        // initial directory picker button
        case 'dirPicker':
          await baseDirHandler()
          break

        // add file button
        case 'addFile':
          await clearSearch()
          addHandler()
          break

        // remove file button
        case 'removeFile':
          await removeHandler()
          break

        // save file button
        case 'saveFile':
          await saveButtonHandler()
          break

        // refresh button
        case 'refreshButton':
          await clearSearch()
          await refreshButtonHandler()
          break

        // change directory button
        case 'changeBaseDir':
          await clearSearch()
          await baseDirHandler()
          break
      }
    }
  })

  window.addEventListener('mousedown', async event => {
    if (event.button === 2) {
      await electron.elementIsFile(elementIsFile(event.target), elementIsFileList(event.target))
    }
  })

  // bind event listeners for editing textarea
  window.addEventListener('input', event => {
    if (event.target.id === 'fileEditor') {
      fileEditHandler(event)
    }
  })

  // bind event listener for various keyboard shortcuts
  window.addEventListener('keydown', keyboardShortcutHandler)

  // entry point
  await configCheck()

  /**
   * Check if a base directory has been selected before starting the app
   */
  async function configCheck () {
    // first check if there's a configured baseDir
    if (!baseDir) {
      await startAppBaseForm()
    } else {
      await initView()
    }
  }

  /**
   * Directory picker form view
   */
  async function startAppBaseForm () {
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

    const compiledTemplate = await electron.renderTemplate('dirPickerTemplate')
    main.innerHTML = compiledTemplate
  }

  /**
   * Main application view
   */
  async function initView () {
    const model = {}

    // clear caches
    currentFile = null
    main.innerHTML = ''
    rightClickCache = null

    // kick back to directory picker form if base directory doesn't exist
    if (!await electron.fileExists(baseDir)) {
      await startAppBaseForm()
      return
    }

    // build list of notes in base directory
    txtFiles = await gatherNotes()

    // store contents of files in model and render template with it
    model.txtFiles = txtFiles
    const newTemplate = await electron.renderTemplate('mainTemplate', model)
    main.innerHTML = newTemplate

    // style main navigation based on platform
    const mainNav = document.querySelector('nav')
    if (await electron.platform() === 'darwin') {
      mainNav.classList.add('darwin-nav')
    }

    // grab a reference to file list and text area
    const grid = document.querySelector('#grid')
    noteTitle = document.querySelector('nav h1')
    fileList = document.querySelectorAll('#fileNames li')
    fileViewer = document.querySelector('#fileEditor')
    lastModified = document.getElementById('lastModified')
    fileNameContainer = document.getElementById('fileNames')
    searchInput = document.getElementById('search')
    printArea = document.getElementById('printArea')

    grid.style['grid-template-columns'] = await electron.storeGet('columnSize') || '200px 2px 1fr'

    Split({
      columnGutters: [{
        track: 1,
        element: document.querySelector('.gutter')
      }],
      onDragEnd: async () => {
        electron.storeSet('columnSize', grid.style['grid-template-columns'])
      }
    })

    const lastFile = await electron.storeGet('lastFile')

    // select last opened file before close if one exists
    if (lastFile) {
      const lastFileInnerText = lastFile.slice(0, -4)

      selectFile(lastFileInnerText)
    }

    // bind event listener to search input
    searchInput.addEventListener('input', debounce(searchHandler, 200))
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
        const result = await electron.confirmNavigateAway(currentFile.name)

        if (result.response === 0) { // yes
          await saveFile()
          clearSelection()
          await reloadFileList(searchFiles)
        } else if (result.response === 2) { // cancel
          await clearSearch()
          return false
        } else { // no
          clearSelection()
          await reloadFileList(searchFiles)
        }
      } else {
        await reloadFileList(searchFiles)
      }
    } else {
      await reloadFileList(txtFiles)
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
    fileNameContainer.prepend(lineItem)
    newFileInput.focus()

    // fade out the text of surrounding elements
    fileNameContainer.classList.add('renaming')

    // clicking away will cancel add
    window.addEventListener('click', clickAwayAdd)

    // bind event listeners to the file name input
    newFileInput.addEventListener('input', fileNameValidation)
    newFileInput.addEventListener('keyup', async event => {
      const key = event.key

      if (event.target.value.trim() === '') {
        event.target.setCustomValidity('Please enter a file name')
      }

      event.target.reportValidity()

      // enter key indicates finished name
      if (key === 'Enter' && event.target.checkValidity()) {
        event.preventDefault()

        // set the new file name based on user input
        const newFileValue = newFileInput.value
        const newFileName = newFileValue + '.txt'

        // remove the input field and replace it with the file name
        newFileInput.remove()
        lineItem.classList.add('fileName')
        lineItem.innerHTML = newFileValue

        // create the new file
        await electron.addNote(baseDir, newFileName)

        // allow files to be selected again
        lockSelection = false
        fileNameContainer.classList.remove('renaming')

        // add the note to the global list
        await addNote(newFileName)

        // reload the list
        await reloadFileList(txtFiles)

        // remove adding file state
        addingFile = false

        window.removeEventListener('click', clickAwayAdd)

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
      window.removeEventListener('click', clickAwayAdd)
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
        const result = await electron.confirmNavigateAway(currentFile.name)

        if (result.response === 0) { // yes
          await saveFile()
          await fileSelection()
        } else if (result.response === 2) { // cancel
          return false
        } else { // no
          await fileSelection()
        }
      } else {
        await fileSelection()
      }
    }

    /**
     * Highlight selected file and remove highlight from other files
     */
    async function fileSelection () {
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

      // update window title
      await electron.updateTitle(currentFile.name)
      noteTitle.innerHTML = currentFile.name
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
    noteTitle.innerHTML = 'txt-notes'
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
  async function saveButtonHandler () {
    if (currentFile && currentFile.edited) {
      await saveFile()
    }
  }

  /**
   * Event handler for clicking remove file button
   */
  async function removeHandler () {
    if (rightClickCache || currentFile) {
      const elementToDelete = rightClickCache || currentFile.element
      const selectedFileName = elementToDelete.textContent + '.txt'
      const result = await electron.removeHandler(baseDir, selectedFileName)

      // invoke returns true if deleted
      if (result) {
        removeNote(selectedFileName)
        elementToDelete.remove()
      }
    }
  }

  /**
   * Event handler for clicking refresh button
   */
  async function refreshButtonHandler () {
    await reloadFileList(txtFiles)
  }

  /**
   * Event handler for clicking change directory button
   */
  async function baseDirHandler () {
    const result = await electron.directoryPicker()

    if (result.filePaths[0]) {
      const selectedBaseDir = result.filePaths[0]

      electron.storeSet('baseDir', selectedBaseDir)
      baseDir = selectedBaseDir

      await initView()
    }
  }

  /**
   * Event handler for clicking copy file name context menu item
   */
  async function copyFileNameHandler () {
    if (rightClickCache) {
      await electron.writeClipboard(rightClickCache.textContent)

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

    // clicking away will cancel rename
    main.addEventListener('click', clickAwayRename)

    /**
     * Event handler for confirming or canceling file rename
     * @param {object} event - Keydown event
     */
    async function renameConfirmHandler (event) {
      const key = event.key
      const newFileName = event.target.value + '.txt'

      if (key === 'Enter' && event.target.checkValidity()) {
        const nowTime = dayjs().valueOf()

        // update note in the list
        renameNote(oldFileName, newFileName, nowTime)

        await electron.renameHandler(baseDir, oldFileName, newFileName, nowTime)

        // remove the old file element
        element.remove()

        // unlock file selection
        lockSelection = false
        fileNameContainer.classList.remove('renaming')

        // create a new element for this renamed file
        const renamedNote = document.createElement('li')
        renamedNote.className = 'fileName'
        renamedNote.textContent = newFileName.slice(0, -4)

        // insert the renamed note
        fileNameContainer.prepend(renamedNote)

        main.removeEventListener('click', clickAwayRename)

        // select the updated note
        renamedNote.click()

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
      element.classList.add('highlight')
      fileNameContainer.classList.remove('renaming')
      main.removeEventListener('click', clickAwayRename)
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
    let valid = true

    // ensure file name isn't blank
    if (input.value.trim() === '') {
      input.setCustomValidity('Please enter a file name')
      valid = false
    }

    // ensure file name doesn't match another file
    if (input.value !== oldFileName) {
      if (txtFiles.find(item => item.fileName === possibleFileName)) {
        input.setCustomValidity('This name matches another file')
        valid = false
      }
    }

    // ensure file name doesn't include invalid character
    if (/[<>:"/\\|?*]/.test(input.value)) {
      input.setCustomValidity('This name includes an invalid character')
      valid = false
    }

    if (valid) {
      input.setCustomValidity('')
    }

    input.reportValidity()
  }

  /**
   * Event handler for various keyboard shortcuts
   * @param {object} event - Keydown event
   */
  async function keyboardShortcutHandler (event) {
    // clearing a search
    if (event.key === 'Escape' && searchInput.value && !lockSelection) {
      await clearSearch()
    }

    // arrow navigation
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
        await electron.exitApp()
      }

      // tell the main process to spin up a confirmation dialog
      const result = await electron.confirmClose(currentFile.name)

      if (result.response === 0) { // yes
        await saveFile()
        await electron.exitApp()
      } else if (result.response === 2) { // cancel
        return false
      } else { // no
        await electron.exitApp()
      }
    } else {
      await electron.exitApp()
    }
  }

  /**
   * Scan the notes directory and return a master list of notes
   * @returns {array} - List of notes
   */
  async function gatherNotes () {
    const txtFiles = await electron.gatherNotes(baseDir)

    // sort files by modified date
    txtFiles.sort(sortByDate)

    return txtFiles
  }

  /**
   * Add a new note to the master notes list
   * @param {string} path - Path to new note file
   */
  async function addNote (fileName) {
    // ensure this is a new note
    if (!txtFiles.find(item => item.fileName === fileName)) {
      const noteData = await electron.getNoteInfo(baseDir, fileName)

      // add file to master note list
      txtFiles.push(noteData)

      // sort files by modified date
      txtFiles.sort(sortByDate)
    }
  }

  /**
   * Remove a note from the master notes list
   * @param {string} file - Path to note being removed
   */
  function removeNote (fileName) {
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
  async function clearSearch () {
    if (searchFiles.length || searchInput.value) {
      searchFiles = []
      searchInput.value = ''
      await reloadFileList(txtFiles)
    }
  }

  /**
   * Perform a fresh render of the file list
   * @param {array} notes - List of notes to render
   */
  async function reloadFileList (notes) {
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
    const newTemplate = await electron.renderTemplate('noteListTemplate', model)
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
  async function saveFile () {
    // set in memory file content
    currentFile.setContent(fileViewer.value)

    // update last modified date
    currentFile.setModifyDate(dayjs().valueOf())

    // write new file data
    // fs.writeFileSync(path.join(baseDir, currentFile.name), fileViewer.value)
    await electron.updateNote(baseDir, currentFile.name, fileViewer.value)

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

  function elementIsFile (element) {
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
  function elementIsFileList (element) {
    if (element.id === 'txtFileList') {
      return true
    }

    return false
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
