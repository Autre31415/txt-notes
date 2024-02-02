# txt-notes Changelog

## Next version

- Put changes here...

## 0.3.5 ()

- Improved clarity of save confirmation dialogs (thanks [aaron9127](https://github.com/aaron9127)!).
- Updated Electron to v28.2.1
- Updated various dependencies.

## 0.3.4 (1/30/23)

- Added cancel option to save changes dialogs (thanks [aaron9127](https://github.com/aaron9127)!).
- Added ability to print currently viewed file.
- Update Electron to v22.1.0.
- Various dependencies updated.

## 0.3.3 (6/18/22)

- Added arm64 distrbution for macOS.
- Update Electron to v19.0.8.

## 0.3.2 (4/22/22)

- Update Electron to v18.1.0.
- Validity tooltips now show up when typing an invalid name while naming/renaming a file.
- Various dependencies updated.

## 0.3.1 (3/8/22)

- Update Electron to v17.1.1.
- There's finally a README!
- Various dependencies updated.

## 0.3.0 (11/8/21)

- Update Electron to v15.3.0.
- [Disable browser node integration and enable context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
- [Enable browser process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox).
- [RIP Spectron placeholder test](https://github.com/electron-userland/spectron/issues/1045).
- Size of file list pane is now remembered and restored when loading the app.
- Fix bug where file list pane would get larger or smaller relative to window size.
- Fix bug where renaming a file would set modified date to a far flung future time.
- All dependencies updated.

## 0.2.4 (12/13/20)

- Update Electron to v11.1.0.
- Fix bug where UI wouldn't update properly when renaming a file.
- Fix bug where last selected file would get forgotten between app loads.
- Fix bug where last modified time would get set to some far flung future time.
- Various dependencies updated.

## 0.2.3 (10/15/20)

- Fix but where newly created file would not show up on the list.
- Various dependencies updated.

## 0.2.2 (10/4/20)

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

## 0.2.1 (8/16/20)

- Add clear button to search input.

## 0.2.0 (8/16/20)

- Update electron to v9.2.0.
- Add file search!
- Major refactors under the hood to improve performance.
- Fix bug where files far down the list would take longer to select.
- Fix bug where adding lots of new files would slow down file selection.
- Fix bug where new file would randomly lose focus.
- Fix bug where pressing arrow keys while editing file name would take away focus.
- Replace moment dependency with dayjs.
- Various dependencies updated.

## 0.1.7 (6/20/20)

- [Eliminate usage of electron remote module](https://medium.com/@nornagon/electrons-remote-module-considered-harmful-70d69500f31)
- Update electron to v9.0.4
- Update chokidar to v3.4.0
- Update electron-context-menu to v2.0.1
- Update electron-store to v5.2.0
- Updtate fs-extra to v9.0.1
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

## 0.1.6 (1/6/20)

- Add github actions CI
- Add spectron/mocha for automated testing
  - First proof of concept test in place
- Bring back the save button
- Better support for Windows:
  - Proper file save menu item with accelerator
  - Button row position accounts for platform
- Update husky to v4.0.0

## 0.1.5 (1/1/20)

- Redesign button UI

## 0.1.4 (12/16/19)

- Fix broken dialogs
- Update lint-staged to v9.5.0

## 0.1.3 (11/21/19)

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

## 0.1.2 (6/5/19)

- Auto select previously selected file on launch
- Added electron-window-state to persist window size/position
- Update electron to v5.0.2
- Update chokidar to v3.0.1
- Update split.js to v1.5.11
- Update electron-builder to v20.43.0
- Update electron-reloader to v0.3.0
- Update husky to v2.4.0
- Update lint-staged to v8.1.7

## 0.1.1 (5/13/19)

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

## 0.1.0 (2/28/19)

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

## 1/7/19

- Update electron to v4.0.1
- Update electron-builder to 20.38.4
- Update husky to v1.3.1
- Fix bug where clicking add file button multiple times will spawn multiple name inputs
- Fix bug where text editor would lose focus immediately after creating a new file

## 12/18/18

- Update moment to v2.23.0
- Update split.js to v 1.5.10
- Update electron to v3.0.13
- Update electron-builder to v20.38.3
- Update husky to v1.3.0
- Update lint-staged to v8.1.0
- Update stylelint to v9.9.0

## 11/24/18

- Fix ability to rename files

## 11/15/18

- Update electron to v3.0.9
- Update teddy to v0.4.28
- Update husky to v1.1.4
- Update stylelint to v9.8.0
- Add electron-builder and add macOS builds
- Update gitignore
- Fix relativity of file paths
- Fix file list scroll behavior when navigating with arrow keys

## 11/07/18

- Update fs-extra to v7.0.1
- Update split.js to v1.5.9
- Update electron to v3.0.8
- Update husky to v1.1.3

## 10/31/18

- Update electron-context-menu to v0.10.1
- Update split.js to v1.5.7
- Update lint-staged to v8.0.4
- Update stylelint to v9.7.1

## 10/25/18

- Update teddy to v0.4.27
- Add .gitignore
- Add husky dev dependency for precommit hooks
- Add lint-staged dev dependency for precommit hooks
- Add stylelint dev dependency for css linting
- Add stylelint-config-standard dependency and use it for stylelint config
- Add test script (Just linting for now)
- Fix css linting (For the first time!)
- Wipe out electron-quick-start readme

## 10/24/18

- File list refresh only happens when a txt is added or removed
- Reorganize templates
- Fix memory leak related to context-menu event listeners
- Update electron to v3.0.6
- Update split.js to v1.5.6

## 10/23/18

- Slight tweaks to last modified date style

## 10/21/18

- Custom scrollbar
- Tweak style for unsaved edits
- Add more verbose code comments
- Fix bug where file would sometimes be marked as edited after a refresh
- Fix bug where app would go blank when base directory is deleted
- Fix bug where app would load blank when base directory doesn't exist
- Fix bug where change directory code would attempt to execute when clicking cancel on the directory picker
- Fix bug where file with same name would be auto selected when changing base directory

## 10/20/18

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

## 10/18/18

- Fix bug where refreshing would cause edits in progress to be lost
- Added chokidar dependency which allows for real time refresh when files are added/removed from base directory
- Fix bug where file was still considered in edit mode until cmd and s keys were released

## 10/17/18

- Fix bug when choosing not to save when navigating away from an edited file
- Fix textarea scrolling to the right
- Clicking refresh keeps current selection including edits
- Added 'copy file name' context menu item

## 10/16/18

- Add form to select base directory
- Add button to change base directory to main toolbar
- Switch base directory config away from config.json to electron-store
- Add electron-reload for dev mode
- Update electron to v3.0.4
- Update split.js to v1.5.4
