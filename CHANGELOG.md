# txt-notes Changelog

## 0.4.1 (11/08/2026)

- Reorganized the note context menu for clarity.
- Fixed layout issues that could occur on small window sizes.
- Tweaked some icons to reduce pixelation.
- Updated dependencies.

## 0.4.0 (11/08/2026)

- Added the ability to search within the currently opened note, with full match highlighting and navigation tools.
- Added ability to pin notes to the top of the list.
- Added a light mode, and options to pick the theme under View > Appearance.
- Added ability to add new notes by dragging txt files into the app.
- Added context menu item to show a note in the system file browser.
- Added context menu item to export a copy of a note.
- Added a notification when a new version is available, along with a check for updates menu item.
- Improved performance when gathering, refreshing, and searching notes.
- Improved security by preventing the app window from navigating away or opening new windows, and adding a content security policy.
- Removed the reload and developer tools menu items outside of development, which were prone to buggy behavior.
- Updated last modified dates to follow the system's date format.
- Fixed a flash of unstyled content when the app was loading up.
- Fixed a bug where opening the app when it was already running would bring up a second copy rather than focusing the existing window.
- Fixed a bug where refreshing wouldn't pick up notes added, changed, or removed outside of the app.
- Fixed a bug where files with ".txt" elsewhere in their name (e.g. backup files) would appear as notes.
- Fixed a security issue where a note file name containing HTML could run code when the note was opened.
- Fixed a bug where the delete button could delete the last right clicked note instead of the selected note.
- Fixed a bug where changing the notes directory would discard unsaved changes without asking.
- Fixed a bug where printing would print the last saved version of a note instead of its unsaved changes.
- Fixed a bug where the window title would still show a note's name after it was deleted.
- Fixed a bug where a note could be created or renamed with the same name as another note in a different case.
- Fixed errors when pressing save with no note open or pressing escape on the directory picker.
- Fixed a bug where UTF-16 notes would display incorrectly and be converted to UTF-8 when saved.
- Fixed a bug where pressing escape wouldn't cancel adding or renaming a note once the name input lost focus.
- Added automated tests.
- Removed several dependencies.
- Updated Electron to v45.2.3.
- Updated dependencies.

## 0.3.10 (11/07/2025)

- Fixed a bug where search input couldn't be clicked on.
- Updated dependencies.

## 0.3.9 (10/20/2025)

- Merged navigation bar into title bar to reduce consumption of vertical space.
- Removed the broken file watcher feature which fixes several bugs, this feature will be reimplemented in a future release.
- Updated app icon.
- Added linux builds.
- Added arm64 build for Windows.
- Fixed a bug where a newly created note would sometimes appear duplicated in the list.
- Updated dependencies.

## 0.3.8 (06/18/2024)

- Fixed a bug where the note list would remain faded out after adding or renaming a note.
- Updated Electron to v31.0.1.
- Updated various dependencies.

## 0.3.7 (05/26/2024)

- Added ability to clear search input by pressing the escape key.
- Fixed a bug where adding/renaming notes would break when clicking the note editor.
- Fixed a bug where renaming a note with unsaved edits would cause those edits to be lost.
- Fixed a bug where multiple notes would appear to be selected when renaming a note.
- Fixed a visual bug where cancelling the renaming of a selected note would also appear to deselect it.
- Fixed a visual bug where adding/rename a note would shift the text of other note names.
- Updated Electron to v30.0.8.
- Updated various dependencies.

## 0.3.6 (02/05/2024)

- Introduced native title bar and updated window title to include selected file name.
- Fixed a bug where navigation buttons and search were inoperable.
- Updated save file icon.

## 0.3.5 (02/01/2024)

- Improved clarity of save confirmation dialogs (thanks [aaron9127](https://github.com/aaron9127)!).
- Updated Electron to v28.2.1
- Updated various dependencies.

## 0.3.4 (01/30/2023)

- Added cancel option to save changes dialogs (thanks [aaron9127](https://github.com/aaron9127)!).
- Added ability to print currently viewed file.
- Update Electron to v22.1.0.
- Various dependencies updated.

## 0.3.3 (06/18/2022)

- Added arm64 build for macOS.
- Update Electron to v19.0.8.

## 0.3.2 (04/22/2022)

- Update Electron to v18.1.0.
- Validity tooltips now show up when typing an invalid name while naming/renaming a file.
- Various dependencies updated.

## 0.3.1 (03/08/2022)

- Update Electron to v17.1.1.
- There's finally a README!
- Various dependencies updated.

## 0.3.0 (11/08/2021)

- Update Electron to v15.3.0.
- [Disable browser node integration and enable context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
- [Enable browser process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox).
- [RIP Spectron placeholder test](https://github.com/electron-userland/spectron/issues/1045).
- Size of file list pane is now remembered and restored when loading the app.
- Fix bug where file list pane would get larger or smaller relative to window size.
- Fix bug where renaming a file would set modified date to a far flung future time.
- All dependencies updated.

## 0.2.4 (12/13/2020)

- Update Electron to v11.1.0.
- Fix bug where UI wouldn't update properly when renaming a file.
- Fix bug where last selected file would get forgotten between app loads.
- Fix bug where last modified time would get set to some far flung future time.
- Various dependencies updated.

## 0.2.3 (10/15/2020)

- Fix but where newly created file would not show up on the list.
- Various dependencies updated.

## 0.2.2 (10/4/2020)

- Update Electron to v10.1.3.
- File add/rename enhancements:
  - Operation can be exited by clicking outside the field.
  - Text is auto selected.
  - Colors are modified to give the input more focus.
- Fix bug where last viewed file would not be open at runtime.
- Fix bug where last modified date was not being read from cache.
- Fix bug where selecting a file with certain special characters in it would lock up selection.
- Fix bug where initial directory picker would sometimes failed to function.
- Fix file rename bug.
- Fix file deletion bug.
- Refactored file selection logic.
- Various dependencies updated.

## 0.2.1 (08/16/2020)

- Add clear button to search input.

## 0.2.0 (08/16/2020)

- Update electron to v9.2.0.
- Add file search!
- Major refactors under the hood to improve performance.
- Fix bug where files far down the list would take longer to select.
- Fix bug where adding lots of new files would slow down file selection.
- Fix bug where new file would randomly lose focus.
- Fix bug where pressing arrow keys while editing file name would take away focus.
- Replace moment dependency with dayjs.
- Various dependencies updated.

## 0.1.7 (06/20/2020)

- [Eliminate usage of electron remote module](https://medium.com/@nornagon/electrons-remote-module-considered-harmful-70d69500f31)
- Update electron to v9.0.4
- Update chokidar to v3.4.0
- Update electron-context-menu to v2.0.1
- Update electron-store to v5.2.0
- Update fs-extra to v9.0.1
- Update moment to v2.27.0
- Update split.js to v1.6.0
- Update teddy to v0.5.3
- Update electron-builder to v22.7.0
- Update electron-reloader to v1.0.1
- Update husky to v4.2.5
- Update lint-staged to v10.2.11
- Update mocha to v8.0.1
- Update spectron to v11.0.0
- Update standard to v14.3.4
- Update stylelint to v13.6.1
- Update stylelint-config-standard to v20.0.0

## 0.1.6 (01/06/2020)

- Add github actions CI
- Add spectron/mocha for automated testing
  - First proof of concept test in place
- Bring back the save button
- Better support for Windows:
  - Proper file save menu item with accelerator
  - Button row position accounts for platform
- Update husky to v4.0.0

## 0.1.5 (01/01/2020)

- Redesign button UI

## 0.1.4 (12/16/2019)

- Fix broken dialogs
- Update lint-staged to v9.5.0

## 0.1.3 (11/21/2019)

- Add right arrow shortcut to enter files from list
- Update electron to v7.1.2
- Update chokidar to v3.3.0
- Update electron-context-menu to v0.15.1
- Update electron-store to v5.1.0
- Update fs-extra to v8.1.0
- Update electron-builder to v21.2.0
- Update husky to v3.1.0
- Update lint-staged to v9.4.3
- Update standard to v14.3.1
- Update stylelint to v12.0.0
- Update stylelint-config-standard to v19.0.0

## 0.1.2 (06/05/2019)

- Auto select previously selected file on launch
- Added electron-window-state to persist window size/position
- Update electron to v5.0.2
- Update chokidar to v3.0.1
- Update split.js to v1.5.11
- Update electron-builder to v20.43.0
- Update electron-reloader to v0.3.0
- Update husky to v2.4.0
- Update lint-staged to v8.1.7

## 0.1.1 (05/13/2019)

- Auto configures base directory to ./tmp in dev mode
- File name validation checks for illegal characters
- Fix bug where renaming currently selected file makes it uneditable
- Update electron to v5.0.1
- Update chokidar to v3.0.0
- Update to electron-context-menu to v0.12.1
- Update to electron-store to v3.2.0
- Update fs-extra to v8.0.1
- Update electron-builder to v20.40.2
- Update husky to v2.2.0
- Update lint-staged to v8.1.6
- Update stylelint to v10.0.1
- Update stylelint-config-standard to v18.3.0

## 0.1.0 (02/28/2019)

- Add native macOS menubar
  - Enables keyboard shortcuts for common features (e.g, copy, past, undo)
- Add preliminary app icon
- Update electron to v4.0.6
- Update chokidar to v2.1.2
- Update electron-context-menu to v0.11.0
- Update moment to v2.24.0
- Update electron-builder to v20.38.5
- Update husky to v1.3.1
- Update lint-staged to v8.1.4
- Update stylelint to v9.10.1

## 01/07/2019

- Update electron to v4.0.1
- Update electron-builder to 20.38.4
- Update husky to v1.3.1
- Fix bug where clicking add file button multiple times will spawn multiple name inputs
- Fix bug where text editor would lose focus immediately after creating a new file

## 12/18/2018

- Update moment to v2.23.0
- Update split.js to v 1.5.10
- Update electron to v3.0.13
- Update electron-builder to v20.38.3
- Update husky to v1.3.0
- Update lint-staged to v8.1.0
- Update stylelint to v9.9.0

## 11/24/2018

- Fix ability to rename files

## 11/15/2018

- Update electron to v3.0.9
- Update teddy to v0.4.28
- Update husky to v1.1.4
- Update stylelint to v9.8.0
- Add electron-builder and add macOS builds
- Update gitignore
- Fix relativity of file paths
- Fix file list scroll behavior when navigating with arrow keys

## 11/07/2018

- Update fs-extra to v7.0.1
- Update split.js to v1.5.9
- Update electron to v3.0.8
- Update husky to v1.1.3

## 10/31/2018

- Update electron-context-menu to v0.10.1
- Update split.js to v1.5.7
- Update lint-staged to v8.0.4
- Update stylelint to v9.7.1

## 10/25/2018

- Update teddy to v0.4.27
- Add .gitignore
- Add husky dev dependency for precommit hooks
- Add lint-staged dev dependency for precommit hooks
- Add stylelint dev dependency for css linting
- Add stylelint-config-standard dependency and use it for stylelint config
- Add test script (Just linting for now)
- Fix css linting (For the first time!)
- Wipe out electron-quick-start readme

## 10/24/2018

- File list refresh only happens when a txt is added or removed
- Reorganize templates
- Fix memory leak related to context-menu event listeners
- Update electron to v3.0.6
- Update split.js to v1.5.6

## 10/23/2018

- Slight tweaks to last modified date style

## 10/21/2018

- Custom scrollbar
- Tweak style for unsaved edits
- Add more verbose code comments
- Fix bug where file would sometimes be marked as edited after a refresh
- Fix bug where app would go blank when base directory is deleted
- Fix bug where app would load blank when base directory doesn't exist
- Fix bug where change directory code would attempt to execute when clicking cancel on the directory picker
- Fix bug where file with same name would be auto selected when changing base directory

## 10/20/2018

- Update electron to v3.0.5
- Update split.js to v1.5.5
- Rejigger the color theme
- Eliminate gutter line between file list and view
- Eliminate ugly border lines between file names
- Fix bug where escaping out of edited rename field would apply changes to the displayed file name
- New/Rename file input redesign:
  - Text box fills area
  - Recolored
  - Form validation (Checks blank, spaces only, and matching existing file name)

## 10/18/2018

- Fix bug where refreshing would cause edits in progress to be lost
- Added chokidar dependency which allows for real time refresh when files are added/removed from base directory
- Fix bug where file was still considered in edit mode until cmd and s keys were released

## 10/17/2018

- Fix bug when choosing not to save when navigating away from an edited file
- Fix textarea scrolling to the right
- Clicking refresh keeps current selection including edits
- Added 'copy file name' context menu item

## 10/16/2018

- Add form to select base directory
- Add button to change base directory to main toolbar
- Switch base directory config away from config.json to electron-store
- Add electron-reload for dev mode
- Update electron to v3.0.4
- Update split.js to v1.5.4
