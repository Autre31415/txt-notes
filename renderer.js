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

  // cancels the add or rename file name input that is currently open, if any
  let cancelNameEdit

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

  // find bar for searching within the open note, and the highlights behind the editor
  let findBar
  let findInput
  let findCount
  let findHighlights

  // start and end offsets of find matches in the open note, and which one is current
  let findMatches = []
  let findIndex = 0

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

  // map of txt files in watched folder, keyed by file name
  let txtFiles = new Map()

  // file names of notes pinned to the top of the list
  let pinned = new Set()

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
        if (currentFile?.edited) {
          await saveFile()
        }
        break
      case 'print':
        // only try printing when looking at a file
        if (currentFile) {
          // this nonsense is necessary because of https://stackoverflow.com/a/4611247
          // TODO: Consider replacing the textarea with a contenteditable element
          printArea.innerText = fileViewer.value

          await electron.printNote()
        }
        break
      case 'copyFileName':
        await copyFileNameHandler()
        break
      case 'togglePin':
        if (rightClickCache) {
          await togglePin(rightClickCache.dataset.file)
        }
        break
      case 'exportNote':
        if (rightClickCache) {
          await electron.exportNote(baseDir, rightClickCache.dataset.file)
        }
        break
      case 'showInFolder':
        if (rightClickCache) {
          await electron.showInFolder(baseDir, rightClickCache.dataset.file)
        }
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
        await removeHandler(rightClickCache)
        break
      case 'find':
        openFind()
        break
      case 'findNext':
        stepFind(1)
        break
      case 'findPrevious':
        stepFind(-1)
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
      this.name = file.dataset.file
      const note = txtFiles.get(this.name)
      this.content = note.content
      this.modifyDate = note.dateCode
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
      const note = txtFiles.get(this.name)
      if (note) {
        note.content = newContent
        note.searchContent = newContent.toLowerCase()
      }
    }

    /**
     * Set a new last modified time for file
     * @param {string} newDate - Unix datestamp
     */
    setModifyDate (newDate) {
      this.modifyDate = newDate
      const note = txtFiles.get(this.name)
      if (note) {
        note.dateCode = newDate
      }
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
          await removeHandler(currentFile?.element)
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

        // find bar buttons
        case 'findPrevious':
          stepFind(-1)
          break
        case 'findNext':
          stepFind(1)
          break
        case 'findClose':
          closeFind()
          break
      }
    }
  })

  window.addEventListener('mousedown', async event => {
    if (event.button === 2) {
      await electron.elementIsFile(elementIsFile(event.target), elementIsFileList(event.target), event.target.hasAttribute('data-pinned'))
    }
  })

  // find highlights wait for a pause in typing, since laying out a very long note's text for them is slow
  const updateFindSoon = debounce(updateFind, 150)

  // bind event listeners for editing textarea
  window.addEventListener('input', event => {
    if (event.target.id === 'fileEditor') {
      fileEditHandler(event)
      updateFindSoon(true)
    }
  })

  // bind event listener for various keyboard shortcuts
  window.addEventListener('keydown', keyboardShortcutHandler)

  // bind event listeners for dropping files into the app
  window.addEventListener('dragover', event => event.preventDefault())
  window.addEventListener('drop', dropHandler)

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
    txtFiles.clear()
    searchFiles = []
    rightClickCache = null
    currentFile = null
    fileNameContainer = null
    fileList = null
    fileViewer = null
    lastModified = null
    searchInput = null

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

    // pins are needed first since they affect sorting
    pinned = new Set((await electron.storeGet('pinnedNotes') || {})[baseDir])

    // build list of notes in base directory
    txtFiles = await gatherNotes()

    // render template with the list of notes
    model.txtFiles = listModel(Array.from(txtFiles.values()))
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
    findBar = document.getElementById('findBar')
    findInput = document.getElementById('findInput')
    findCount = document.getElementById('findCount')
    findHighlights = document.getElementById('findHighlights')

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
      selectFile(lastFile)
    }

    // bind event listener to search input
    searchInput.addEventListener('input', debounce(searchHandler, 100))

    // bind event listeners for finding within the open note
    findInput.addEventListener('input', () => updateFindSoon())
    findInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault()
        stepFind(event.shiftKey ? -1 : 1)
      } else if (event.key === 'Escape') {
        // keep escape from also clearing the note search
        event.stopPropagation()
        closeFind()
      }
    })
    fileViewer.addEventListener('scroll', () => {
      findHighlights.scrollTop = fileViewer.scrollTop
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

      for (const txt of txtFiles.values()) {
        // search name and file content
        if (txt.searchName.includes(input) || txt.searchContent.includes(input)) {
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
      await reloadFileList(Array.from(txtFiles.values()))
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

    // escape will cancel add even when the input loses focus
    cancelNameEdit = escapeAdd

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
        lineItem.textContent = newFileValue
        lineItem.dataset.file = newFileName

        // create the new file
        await electron.addNote(baseDir, newFileName)

        // allow files to be selected again
        lockSelection = false
        fileNameContainer.classList.remove('renaming')

        // add the note to the global list
        await addNote(newFileName)

        // reload the list
        await reloadFileList(Array.from(txtFiles.values()))

        // remove adding file state
        addingFile = false
        cancelNameEdit = null

        window.removeEventListener('click', clickAwayAdd)

        // select the new file and focus on the text editor
        selectFile(newFileName)
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
      cancelNameEdit = null
    }
  }

  /**
   * Event handler for clicking a file in the list
   * @param {object} event - Click event
   */
  async function fileClickHandler (event) {
    const element = event.target
    if (!lockSelection && (!currentFile || currentFile.name !== element.dataset.file)) {
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
      updateFind()

      // update window title
      await electron.updateTitle(currentFile.name)
      noteTitle.textContent = currentFile.name
    }
  }

  /**
   * Select a file in the list by name
   * @param {string} fileName - File name to select
   */
  function selectFile (fileName) {
    for (const file of fileList) {
      if (file.dataset.file === fileName) {
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

    // reset the app title to the app name
    noteTitle.textContent = 'txt-notes'
    electron.updateTitle()

    closeFind()
  }

  /**
   * Open the find bar, searching for the editor's selected text if there is any
   */
  function openFind () {
    if (!currentFile) {
      return
    }

    const selected = fileViewer.value.slice(fileViewer.selectionStart, fileViewer.selectionEnd)
    if (selected && !selected.includes('\n')) {
      findInput.value = selected
    }

    findBar.hidden = false
    findHighlights.hidden = false
    findInput.focus()
    findInput.select()
    updateFind()
  }

  /**
   * Close the find bar and select the current match in the editor
   */
  function closeFind () {
    if (!findBar || findBar.hidden) {
      return
    }

    findBar.hidden = true
    findHighlights.hidden = true
    findHighlights.replaceChildren()

    // the note may have just been closed, leaving nothing to select
    if (currentFile) {
      const match = findMatches[findIndex]
      fileViewer.focus()
      if (match) {
        fileViewer.setSelectionRange(...match)
      }
    }
  }

  /**
   * Find matches for the find bar's text in the open note and highlight them
   * @param {boolean} editing - The note changed, so keep the current match and scroll position
   */
  function updateFind (editing) {
    if (!findBar || findBar.hidden) {
      return
    }

    // match the text literally and ignore case
    const query = findInput.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    findMatches = query ? [...fileViewer.value.matchAll(new RegExp(query, 'gi'))].map(match => [match.index, match.index + match[0].length]) : []

    // start from the first match after the cursor
    if (!editing) {
      findIndex = Math.max(findMatches.findIndex(([start]) => start >= fileViewer.selectionStart), 0)
    }

    findIndex = Math.min(findIndex, Math.max(findMatches.length - 1, 0))
    showMatches(!editing)
  }

  /**
   * Move to the next or previous find match, opening the find bar if needed
   * @param {number} step - 1 for the next match, -1 for the previous one
   */
  function stepFind (step) {
    // opening needs a note, and does nothing without one
    if (!findBar || findBar.hidden) {
      openFind()
    } else if (findMatches.length) {
      findIndex = (findIndex + step + findMatches.length) % findMatches.length
      showMatches(true)
    }
  }

  /**
   * Draw find matches behind the editor and show the match count
   * @param {boolean} scroll - Scroll the editor to the current match
   */
  function showMatches (scroll) {
    const text = fileViewer.value
    const nodes = []
    let last = 0

    for (const [index, [start, end]] of findMatches.entries()) {
      const mark = document.createElement('mark')
      mark.textContent = text.slice(start, end)
      if (index === findIndex) {
        mark.className = 'current'
      }
      nodes.push(text.slice(last, start), mark)
      last = end
    }

    // the trailing space keeps a final empty line as tall as it is in the editor
    nodes.push(text.slice(last) + ' ')
    findHighlights.replaceChildren(...nodes)

    const current = findHighlights.querySelector('.current')
    if (scroll && current) {
      fileViewer.scrollTop = current.offsetTop - fileViewer.clientHeight / 2
    }
    findHighlights.scrollTop = fileViewer.scrollTop

    findCount.textContent = findMatches.length ? `${findIndex + 1} of ${findMatches.length}` : 'No results'
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
   * Event handler for deleting a file from the toolbar or context menu
   * @param {object} elementToDelete - Element representing the file to delete
   */
  async function removeHandler (elementToDelete) {
    if (elementToDelete) {
      const selectedFileName = elementToDelete.dataset.file
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
    txtFiles = await gatherNotes()
    await reloadFileList(Array.from(txtFiles.values()))
  }

  /**
   * Event handler for dropping txt files into the app to add them as notes
   * @param {object} event - Drop event
   */
  async function dropHandler (event) {
    // let dragged text drop into the editor as usual
    if (!event.dataTransfer.files.length) {
      return
    }

    event.preventDefault()
    const files = [...event.dataTransfer.files].filter(file => file.name.endsWith('.txt'))

    // notes can only be added from the main view while no file name is being edited
    if (!fileNameContainer || lockSelection || !files.length) {
      return
    }

    let fileName
    for (const file of files) {
      const imported = await electron.importNote(baseDir, electron.getPathForFile(file))

      // skips anything that can't be a note, such as a folder
      if (imported) {
        fileName = imported
        await addNote(fileName)
      }
    }

    // show the full list and select the last dropped note
    await clearSearch()
    await reloadFileList(Array.from(txtFiles.values()))
    selectFile(fileName)
  }

  /**
   * Event handler for clicking change directory button
   */
  async function baseDirHandler () {
    const result = await electron.directoryPicker()

    if (result.filePaths[0]) {
      const selectedBaseDir = result.filePaths[0]

      // spin up a save confirmation if a file is being edited
      if (currentFile && currentFile.edited) {
        const confirmation = await electron.confirmNavigateAway(currentFile.name)

        if (confirmation.response === 0) { // yes
          await saveFile()
        } else if (confirmation.response === 2) { // cancel
          return
        }
      }

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
    const oldName = element.textContent
    const oldFileName = element.dataset.file

    // renaming only changes the name, the extension stays the same
    const extension = oldFileName.slice(oldName.length)

    // create an input populated with the current file name and give it focus
    const fileRenameInput = document.createElement('input')
    fileRenameInput.setAttribute('type', 'text')
    fileRenameInput.classList.add('fileNameEdit')
    fileRenameInput.value = oldName
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

    // escape will cancel rename even when the input loses focus
    cancelNameEdit = escapeEdit

    /**
     * Event handler for confirming or canceling file rename
     * @param {object} event - Keydown event
     */
    async function renameConfirmHandler (event) {
      const key = event.key
      const newFileName = event.target.value + extension

      if (key === 'Enter' && event.target.checkValidity()) {
        const nowTime = Date.now()

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
        renamedNote.textContent = event.target.value
        renamedNote.dataset.file = newFileName

        // insert the renamed note
        if (pinned.has(newFileName)) {
          renamedNote.setAttribute('data-pinned', '')
        }
        moveToTop(renamedNote)

        main.removeEventListener('click', clickAwayRename)
        cancelNameEdit = null

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
      fileNameValidation(event, oldName)
    }

    /**
     * Cancel file rename in progress
     */
    function escapeEdit () {
      fileRenameInput.remove()
      element.textContent = oldName
      element.classList.add('highlight')
      fileNameContainer.classList.remove('renaming')
      main.removeEventListener('click', clickAwayRename)
      lockSelection = false
      cancelNameEdit = null
    }
  }

  /**
   * Event handler for file name validation
   * @param {object} event - Key event
   * @param {string} oldName - If renaming a file, the original name is valid
   */
  function fileNameValidation (event, oldName) {
    const input = event.target
    const lowerName = input.value.toLowerCase()
    let valid = true

    // ensure file name isn't blank
    if (input.value.trim() === '') {
      input.setCustomValidity('Please enter a file name')
      valid = false
    }

    // ensure name doesn't match another note, ignoring case because macOS and Windows are awkward about it
    const isOwnName = oldName !== undefined && lowerName === oldName.toLowerCase()

    if (!isOwnName && [...txtFiles.values()].some(note => note.name.toLowerCase() === lowerName)) {
      input.setCustomValidity('This name matches another file')
      valid = false
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
    // cancel an open add or rename input when focus has moved off of it
    if (event.key === 'Escape' && cancelNameEdit && !event.target.classList.contains('fileNameEdit')) {
      cancelNameEdit()
      return
    }

    // clearing a search
    if (event.key === 'Escape' && searchInput?.value && !lockSelection) {
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
   * @returns {Map} - Map of notes
   */
  async function gatherNotes () {
    const notesArray = await electron.gatherNotes(baseDir)

    // sort files by modified date
    notesArray.sort(sortNotes)

    // precompute lowercased name and content for fast search
    for (const note of notesArray) {
      note.searchName = note.name.toLowerCase()
      note.searchContent = note.content.toLowerCase()
    }

    return new Map(notesArray.map(n => [n.fileName, n]))
  }

  /**
   * Add a new note to the master notes list
   * @param {string} path - Path to new note file
   */
  async function addNote (fileName) {
    // ensure this is a new note
    if (!txtFiles.has(fileName)) {
      const noteData = await electron.getNoteInfo(baseDir, fileName)

      // precompute lowercased name and content for fast search
      noteData.searchName = noteData.name.toLowerCase()
      noteData.searchContent = noteData.content.toLowerCase()

      // add file to master note list
      txtFiles.set(noteData.fileName, noteData)
    }
  }

  /**
   * Remove a note from the master notes list
   * @param {string} file - Path to note being removed
   */
  function removeNote (fileName) {
    if (txtFiles.has(fileName)) {
      if (currentFile && fileName === currentFile.name) {
        clearSelection()
      }

      txtFiles.delete(fileName)
      searchFiles = searchFiles.filter(note => note.fileName !== fileName)
    }

    if (pinned.delete(fileName)) {
      savePins()
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
    const oldNote = txtFiles.get(oldFile)

    // update note with new name and modified time
    if (oldNote) {
      txtFiles.delete(oldFile)
      oldNote.fileName = newFile
      oldNote.name = newFile.slice(0, newFile.lastIndexOf('.')) // file name without extension
      oldNote.searchName = oldNote.name.toLowerCase()
      oldNote.dateCode = time
      txtFiles.set(newFile, oldNote)
    }

    // carry a pin over to the new name
    if (pinned.delete(oldFile)) {
      pinned.add(newFile)
      savePins()
    }
  }

  /**
   * Pin or unpin a note at the top of the list
   * @param {string} fileName - Name of the note
   */
  async function togglePin (fileName) {
    if (!pinned.delete(fileName)) {
      pinned.add(fileName)
    }

    savePins()
    await reloadFileList(searchInput.value ? searchFiles : Array.from(txtFiles.values()))
  }

  /**
   * Save pins for the current directory to the store
   */
  async function savePins () {
    const pinnedNotes = await electron.storeGet('pinnedNotes') || {}
    pinnedNotes[baseDir] = [...pinned]
    electron.storeSet('pinnedNotes', pinnedNotes)
  }

  /**
   * Clear search form and files cache
   */
  async function clearSearch () {
    if (searchFiles.length || searchInput.value) {
      searchFiles = []
      searchInput.value = ''
      await reloadFileList(Array.from(txtFiles.values()))
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

    // sort notes by pins and last modified
    notes.sort(sortNotes)

    // render template with the list of notes
    model.txtFiles = listModel(notes)
    const newTemplate = await electron.renderTemplate('noteListTemplate', model)
    fileNameContainer.innerHTML = newTemplate

    // get fresh reference to list of files
    fileList = document.querySelectorAll('#fileNames li')

    // handle a refresh while a file is selected
    if (currentFile) {
      // if a file was being edited before a refresh it needs to start out selected
      if (currentFile.edited) {
        for (const file of fileList) {
          if (file.dataset.file === currentFile.name) {
            currentFile.setElement(file)
            currentFile.element.classList.add('highlight')
            currentFile.element.classList.add('edited')
            updateLastModified()
            fileViewer.value = editedFileCache
            break
          }
        }
      } else if (!txtFiles.has(currentFile.name)) {
        // the open file was deleted outside the app since the last refresh
        clearSelection()
      } else {
        for (const file of fileList) {
          if (file.dataset.file === currentFile.name) {
            // sync open file with fresh data pulled in by a refresh
            const note = txtFiles.get(currentFile.name)
            currentFile.content = note.content
            currentFile.modifyDate = note.dateCode
            fileViewer.value = currentFile.content
            currentFile.setElement(file)
            currentFile.element.classList.add('highlight')
            updateLastModified()
            break
          }
        }
      }

      // the note's text may have changed
      updateFind(true)
    }
  }

  /**
   * Save changes to file
   */
  async function saveFile () {
    // recreate the file if it was deleted outside of the app while being edited
    if (!txtFiles.has(currentFile.name)) {
      await electron.updateNote(baseDir, currentFile.name, fileViewer.value)
      await addNote(currentFile.name)
    }

    // set in memory file content
    currentFile.setContent(fileViewer.value)

    // update last modified date
    currentFile.setModifyDate(Date.now())

    // write new file data
    await electron.updateNote(baseDir, currentFile.name, fileViewer.value)

    moveToTop(currentFile.element)

    // update last modified time in ui
    updateLastModified()

    // remove edited status
    currentFile.setEdited(false)
    currentFile.element.classList.remove('edited')
  }

  /**
   * Move a note to the top of the list, below any pinned notes unless it's pinned itself
   * @param {object} element - Element representing the note
   */
  function moveToTop (element) {
    element.remove()
    const target = element.hasAttribute('data-pinned') ? fileNameContainer.firstChild : fileNameContainer.querySelector('li:not([data-pinned])')
    fileNameContainer.insertBefore(element, target)
  }

  /**
   * Shape notes for the note list template
   * @param {array} notes - List of notes
   * @returns {array} - Names and pin states of the notes
   */
  function listModel (notes) {
    return notes.map(note => ({ name: note.name, fileName: note.fileName, pinned: pinned.has(note.fileName) }))
  }

  /**
   * Update last modified field
   */
  function updateLastModified () {
    lastModified.textContent = new Date(currentFile.modifyDate).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
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
   * Array comparison function that sorts array of files by pins then date
   * @param {object} a - Array indice
   * @param {object} b - Array indice
   * @return {number} - Array sorting index
   */
  function sortNotes (a, b) {
    if (pinned.has(a.fileName) !== pinned.has(b.fileName)) {
      return pinned.has(a.fileName) ? -1 : 1
    } else if (a.dateCode > b.dateCode) {
      return -1
    } else if (a.dateCode < b.dateCode) {
      return 1
    } else {
      return 0
    }
  }
})()
