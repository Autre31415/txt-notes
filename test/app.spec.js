const { test, expect, _electron: electron } = require('@playwright/test')
const fs = require('fs')
const os = require('os')
const path = require('path')

let app
let page
let dir
let notesDir

/**
 * Launch the app against a fresh notes directory
 * @param {object} notes - Note contents keyed by file name, newest first
 */
async function launch (notes) {
  // the app reads notes from ./tmp in dev mode, so run it from a temp directory
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'txt-notes-')))
  notesDir = path.join(dir, 'tmp')
  fs.mkdirSync(notesDir)

  // stagger modified times so list order is predictable, starting a day back
  // so changes made during a test show a different modified time
  let time = Date.now() / 1000 - 86400
  for (const [fileName, content] of Object.entries(notes)) {
    fs.writeFileSync(path.join(notesDir, fileName), content)
    fs.utimesSync(path.join(notesDir, fileName), time, time)
    time -= 60
  }

  await start()
}

/**
 * Start the app, keeping settings in the test directory
 */
async function start () {
  app = await electron.launch({
    args: [path.join(__dirname, '..')],
    colorScheme: null, // let the app's appearance setting decide rather than playwright's light default
    cwd: dir,
    env: { ...process.env, TXT_NOTES_USER_DATA: path.join(dir, 'userData') }
  })
  page = await app.firstWindow()
  await page.waitForSelector('#fileNames', { state: 'attached' })
}

/**
 * Locate a note in the list by name
 * @param {string} name - Note name without extension
 */
function note (name) {
  return page.locator('#fileNames').getByText(name, { exact: true })
}

/**
 * Answer native message boxes with the given button
 * @param {number} response - Index of the button to press
 */
async function answerDialogs (response) {
  await app.evaluate(({ dialog }, response) => {
    dialog.showMessageBox = async () => ({ response })
  }, response)
}

/**
 * Click an item in the app menu
 * @param {...string} labels - Labels leading to the item, e.g. 'View', 'Appearance', 'Light'
 */
async function clickMenu (...labels) {
  await app.evaluate(({ Menu }, labels) => {
    let item = { submenu: Menu.getApplicationMenu() }
    for (const label of labels) {
      item = item.submenu.items.find(item => item.label === label)
    }
    item.click()
  }, labels)
}

/**
 * Right click a note and pick a context menu action
 * @param {string} name - Note name without extension
 * @param {string} action - Message the context menu item sends
 */
async function contextMenu (name, action) {
  // the native menu can't be driven, so send its message directly
  await note(name).dispatchEvent('mousedown', { button: 2 })
  await app.evaluate(({ BrowserWindow }, action) => {
    BrowserWindow.getAllWindows()[0].webContents.send('ping', action)
  }, action)
}

/**
 * Read a note's contents from disk
 * @param {string} name - Note name without extension
 */
function readNote (name) {
  return fs.readFileSync(path.join(notesDir, name + '.txt'), 'utf8')
}

// start every test from a clean slate so none depends on what ran before it
test.beforeEach(() => {
  app = page = dir = notesDir = null
})

test.afterEach(async () => {
  // a skipped test never launched the app, so there's nothing to clean up
  if (app) {
    // discard any unsaved edits so closing doesn't wait on a dialog
    await answerDialogs(1)
    await app.close()
  }

  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('lists notes newest first and opens them', async () => {
  await launch({ 'newer.txt': 'one', 'older.txt': 'two' })

  await expect(page.locator('#fileNames li')).toHaveText(['newer', 'older'])

  await note('older').click()
  await expect(page.locator('#fileEditor')).toHaveValue('two')
  await expect(page.locator('nav h1')).toHaveText('older.txt')
})

test('creates notes and moves saved notes to the top', async () => {
  await launch({ 'newer.txt': 'one', 'older.txt': 'two' })

  await page.click('#addFile')
  await page.keyboard.type('fresh')
  await page.keyboard.press('Enter')
  await expect(page.locator('nav h1')).toHaveText('fresh.txt')
  expect(readNote('fresh')).toBe('')

  await note('older').click()
  const modified = await page.locator('#lastModified').textContent()
  await page.locator('#fileEditor').fill('edited')
  await expect(note('older')).toHaveClass(/edited/)
  await page.click('#saveFile')

  await expect(note('older')).not.toHaveClass(/edited/)
  await expect(page.locator('#lastModified')).not.toHaveText(modified)
  await expect(page.locator('#fileNames li')).toHaveText(['older', 'fresh', 'newer'])
  expect(readNote('older')).toBe('edited')
})

test('renames notes, allowing case changes but not duplicates', async () => {
  await launch({ 'alpha.txt': '', 'beta.txt': '' })
  const input = page.locator('.fileNameEdit')

  // escape cancels even after focus leaves the input
  await contextMenu('alpha', 'renameFile')
  await page.locator('#fileEditor').focus()
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)

  await contextMenu('alpha', 'renameFile')
  await input.fill('BETA')
  expect(await input.evaluate(el => el.validationMessage)).toBe('This name matches another file')

  await input.fill('Alpha')
  await page.keyboard.press('Enter')
  await expect(note('Alpha')).toBeVisible()
  expect(fs.readdirSync(notesDir)).toContain('Alpha.txt')
})

test('deletes the selected note', async () => {
  await launch({ 'keep.txt': '', 'remove.txt': '' })

  await note('remove').click()
  await note('keep').dispatchEvent('mousedown', { button: 2 })
  await answerDialogs(1)
  await page.click('#removeFile')

  await expect(page.locator('#fileNames li')).toHaveText(['keep'])
  await expect(page.locator('nav h1')).toHaveText('txt-notes')
  expect(fs.readdirSync(notesDir)).toEqual(['keep.txt'])
})

test('refreshes notes changed outside of the app', async () => {
  await launch({ 'open.txt': 'before' })
  await note('open').click()
  const modified = await page.locator('#lastModified').textContent()

  fs.writeFileSync(path.join(notesDir, 'open.txt'), 'after')
  fs.writeFileSync(path.join(notesDir, 'new.txt'), '')
  await page.click('#refreshButton')
  await expect(page.locator('#fileEditor')).toHaveValue('after')
  await expect(page.locator('#lastModified')).not.toHaveText(modified)
  await expect(note('new')).toBeVisible()

  fs.unlinkSync(path.join(notesDir, 'open.txt'))
  await page.click('#refreshButton')
  await expect(page.locator('#fileNames li')).toHaveText(['new'])
  await expect(page.locator('#fileEditor')).toHaveValue('')
})

test('searches note names and contents', async () => {
  await launch({ 'groceries.txt': 'milk', 'todo.txt': 'buy MILK', 'other.txt': '' })
  const search = page.locator('#search')

  await search.fill('milk')
  await expect(page.locator('#fileNames li')).toHaveText(['groceries', 'todo'])

  await search.fill('other')
  await expect(page.locator('#fileNames li')).toHaveText(['other'])

  await page.keyboard.press('Escape')
  await expect(page.locator('#fileNames li')).toHaveCount(3)
})

test('keeps search results in sync with changes to notes', async () => {
  await launch({ 'milk a.txt': '', 'milk b.txt': '', 'milk c.txt': '', 'other.txt': '' })
  const list = page.locator('#fileNames li')
  await page.locator('#search').fill('milk')
  await expect(list).toHaveText(['milk a', 'milk b', 'milk c'])

  await note('milk c').click()
  await page.locator('#fileEditor').fill('edited')
  await page.click('#saveFile')
  await expect(list).toHaveText(['milk c', 'milk a', 'milk b'])

  await contextMenu('milk a', 'renameFile')
  await page.locator('.fileNameEdit').fill('milk d')
  await page.keyboard.press('Enter')
  await expect(list).toHaveText(['milk d', 'milk c', 'milk b'])

  await answerDialogs(1)
  await page.click('#removeFile')
  await expect(list).toHaveText(['milk c', 'milk b'])

  // pinning redraws the results, which shouldn't bring back the deleted note
  await contextMenu('milk b', 'togglePin')
  await expect(note('milk b')).toHaveAttribute('data-pinned')
  await expect(list).toHaveText(['milk b', 'milk c'])

  await page.keyboard.press('Escape')
  await expect(list).toHaveText(['milk b', 'milk c', 'other'])
})

test('finds text within the open note', async () => {
  await launch({ 'note.txt': 'one Apple\ntwo\nthree apple pie' })
  await note('note').click()

  await clickMenu('Edit', 'Find…')
  await expect(page.locator('#findInput')).toBeFocused() // the menu reaches the page asynchronously
  await expect(page.locator('#findCount')).toHaveText('No results')
  await page.keyboard.type('apple')
  await expect(page.locator('#findCount')).toHaveText('1 of 2')
  await expect(page.locator('#findHighlights mark')).toHaveText(['Apple', 'apple'])

  await page.keyboard.press('Enter')
  await expect(page.locator('#findCount')).toHaveText('2 of 2')

  // closing the find bar selects the current match in the editor
  await page.keyboard.press('Escape')
  await expect(page.locator('#findBar')).toBeHidden()
  expect(await page.locator('#fileEditor').evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([20, 25])
})

test('asks before discarding unsaved edits', async () => {
  await launch({ 'first.txt': 'one', 'second.txt': 'two' })
  await note('first').click()
  await page.locator('#fileEditor').fill('unsaved')

  await answerDialogs(2) // cancel
  await note('second').click()
  await expect(page.locator('#fileEditor')).toHaveValue('unsaved')

  await answerDialogs(1) // don't save
  await note('second').click()
  await expect(page.locator('#fileEditor')).toHaveValue('two')
  expect(readNote('first')).toBe('one')
})

test('keeps UTF-16 notes UTF-16 when saving', async () => {
  const utf16 = text => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')])
  await launch({ 'wide.txt': utf16('héllo') })

  await note('wide').click()
  await expect(page.locator('#fileEditor')).toHaveValue('héllo')
  await page.locator('#fileEditor').fill('héllo ✓')
  await page.click('#saveFile')

  await expect(note('wide')).not.toHaveClass(/edited/)
  expect(fs.readFileSync(path.join(notesDir, 'wide.txt'))).toEqual(utf16('héllo ✓'))
})

test('shows note names as text rather than HTML', async () => {
  test.skip(process.platform === 'win32', 'Windows file names cannot contain < or >')
  await launch({ '<b>bold<b>.txt': '' })

  await note('<b>bold<b>').click()
  await expect(page.locator('nav h1')).toHaveText('<b>bold<b>.txt')
})

test('pins notes to the top of the list', async () => {
  await launch({ 'newer.txt': '', 'older.txt': '', 'oldest.txt': '' })
  const list = page.locator('#fileNames li')

  await contextMenu('oldest', 'togglePin')
  await expect(list).toHaveText(['oldest', 'newer', 'older'])

  // saved notes move up to just below pinned ones
  await note('older').click()
  await page.locator('#fileEditor').fill('edited')
  await page.click('#saveFile')
  await expect(list).toHaveText(['oldest', 'older', 'newer'])

  // pins follow renames and are remembered across restarts
  await contextMenu('oldest', 'renameFile')
  await page.locator('.fileNameEdit').fill('renamed')
  await page.keyboard.press('Enter')
  await app.close()
  await start()
  await expect(page.locator('#fileNames li')).toHaveText(['renamed', 'older', 'newer'])
  await expect(note('renamed')).toHaveAttribute('data-pinned')
  await expect(page.locator('nav h1')).toHaveText('renamed.txt') // last opened note is reopened

  await contextMenu('renamed', 'togglePin')
  await expect(note('renamed')).not.toHaveAttribute('data-pinned')
})

test('adds dropped txt files as notes', async () => {
  await launch({ 'dropped.txt': 'already here' })
  const outside = path.join(dir, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'dropped.txt'), 'from outside')
  fs.writeFileSync(path.join(outside, 'image.png'), '')
  fs.mkdirSync(path.join(outside, 'folder.txt')) // a folder named like a note is skipped

  // drop real files through the devtools protocol so they carry their paths
  const cdp = await page.context().newCDPSession(page)
  const data = { items: [], files: ['folder.txt', 'dropped.txt', 'image.png'].map(name => path.join(outside, name)), dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', { type, x: 100, y: 100, data })
  }

  await expect(page.locator('#fileNames li')).toHaveText(['dropped (2)', 'dropped'])
  await expect(page.locator('#fileEditor')).toHaveValue('from outside')
})

test('switches between light and dark appearance', async () => {
  await launch({})
  const background = () => page.evaluate(() => window.getComputedStyle(document.body).backgroundColor)

  await clickMenu('View', 'Appearance', 'Dark')
  await expect.poll(background).toBe('rgb(54, 54, 54)')

  // the choice is remembered across restarts
  await clickMenu('View', 'Appearance', 'Light')
  await expect.poll(background).toBe('rgb(243, 243, 243)')
  await app.close()
  await start()
  await expect.poll(background).toBe('rgb(243, 243, 243)')

  // going back to following the system
  await clickMenu('View', 'Appearance', 'Match the system')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
})

test('checks GitHub for a newer release', async () => {
  await launch({})
  await app.evaluate(({ dialog, shell }) => {
    globalThis.fetch = async () => ({ json: async () => ({ tag_name: globalThis.latestTag, html_url: 'https://github.com/release' }) })
    dialog.showMessageBox = async options => {
      globalThis.message = options.message
      return { response: 0 }
    }
    shell.openExternal = url => { globalThis.openedUrl = url }
  })
  const message = () => app.evaluate(() => globalThis.message)

  // 0.10.0 sorts before 0.4.0 as text, so this also checks versions compare numerically
  await app.evaluate(() => { globalThis.latestTag = 'v0.10.0' })
  await clickMenu('Help', 'Check for Updates…')
  await expect.poll(message).toBe('txt-notes 0.10.0 is available.')
  expect(await app.evaluate(() => globalThis.openedUrl)).toBe('https://github.com/release')

  const current = await app.evaluate(({ app }) => app.getVersion())
  await app.evaluate((app, current) => { globalThis.latestTag = 'v' + current }, current)
  await clickMenu('Help', 'Check for Updates…')
  await expect.poll(message).toBe(`txt-notes ${current} is the latest version.`)
})

test('exports a note under a new name', async () => {
  await launch({ 'note.txt': 'exported text' })
  const exported = path.join(dir, 'renamed copy.txt')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, exported)

  await contextMenu('note', 'exportNote')
  await expect.poll(() => fs.existsSync(exported)).toBe(true)
  expect(fs.readFileSync(exported, 'utf8')).toBe('exported text')
})

test('shows notes in the file browser', async () => {
  await launch({ 'found.txt': '' })
  await app.evaluate(({ shell }) => {
    shell.showItemInFolder = filePath => { globalThis.shownPath = filePath }
  })

  await contextMenu('found', 'showInFolder')
  await expect.poll(() => app.evaluate(() => globalThis.shownPath)).toBe(path.join(notesDir, 'found.txt'))
})
