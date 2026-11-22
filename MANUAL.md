# Sephral’s File Commander Manual

This manual covers the details. For a quick overview see the [README](README.md).

## Features

* Two panel browser for Foundry's storages: User Data, Public and S3
* Keyboard navigation in the style of the classic commanders with arrow keys, `Enter`, `Tab`, `Backspace` and `F3`
* Copy files and whole folders from one panel to the other
* Asks before a copy or upload overwrites an existing file. With several files you can apply the answer to all remaining files
* Reports files the server did not store (for example a file type Foundry does not accept) with a warning at the end of the copy or upload, instead of claiming success
* Folder creation in writable storages
* Local upload into the active panel
* Folder upload (`Ctrl+Shift+U` or the *Folder Upload* button) and drag and drop of files and whole folders from the operating system onto a panel. Subfolders keep their structure and are created as needed, empty folders dropped from the desktop too. A bar shows how many files are done, the current file and a *Cancel* button, which stops after the current file. Files that the operating system leaves in folders (`.DS_Store`, `Thumbs.db`, `desktop.ini`) are skipped
* Optional conversion of images to WebP while uploading, see [WebP on upload](#webp-on-upload)
* A thumbnail grid for each panel, see [Thumbnail grid](#thumbnail-grid)
* Images and videos open in Foundry's image viewer, audio files play in a small player
* `Ctrl+C` copies the path of the selected entry in the form Foundry's file picker uses: a relative path for User Data and Public, the full URL for S3 and The Forge. Paste it into token images, tiles or playlist sounds
* A status line shows the path of the selected entry
* Direct access from Foundry settings and a scene control icon on the left side

## Hotkeys inside the commander

* `ArrowUp` / `ArrowDown` move the selection
* `Home` / `End` jump to the first or last entry
* `ArrowLeft` or `Backspace` go to the parent directory
* `ArrowRight` or `Enter` open the selected directory or file
* `F3` views the selected entry: images and videos in Foundry's image viewer, audio in a small player, other files in a new browser tab
* `Tab` switches the active panel
* `Ctrl+R` refreshes both panels
* `Ctrl+C` copies the path of the selected entry
* `F5` copies the selected entry to the opposite panel
* `F7` creates a directory in the active panel
* `Ctrl+U` uploads files into the active panel
* `Ctrl+Shift+U` uploads a whole folder into the active panel
* On a Mac `Cmd+C`, `Cmd+R`, `Cmd+U` and `Cmd+Shift+U` work like the Ctrl keys (the function bar then shows Cmd, Ctrl keeps working)

## WebP on upload

The checkbox *Convert images to WebP on upload* below the panels (or the setting of the same name) converts PNG, JPG and BMP images to WebP while they are uploaded: single files, folders and dropped files alike. The file keeps its name with the ending `.webp`. GIF, animated PNG, SVG, videos and everything that is not a raster image stay as they are, and so does a file the browser cannot convert. *WebP quality* in the settings sets the detail kept, from 0.5 to 1, default 0.85. Copying with `F5` never converts. Converting happens in your browser, one file at a time, so very large maps take a moment.

## Thumbnail grid

The button next to the source of each panel switches that panel between the list and a grid of thumbnails. Images and videos show a small picture (a video its first frame), folders, audio and other files an icon. Thumbnails load only when they scroll into view, so a folder with hundreds of images stays quick. Selection, double click, copy, path copy and view work as in the list. In the grid `ArrowLeft` and `ArrowRight` move by one entry, `ArrowUp` and `ArrowDown` by a row, `Backspace` still goes to the parent folder and `Enter` opens. The choice is kept per panel with *Restore last session*.

## Permissions

Opening the commander needs the Foundry permission to browse files. Copy, upload (also folders and drops) and new folders also need the permission to upload files. Without it these commands are shown disabled.

## Settings

* `Open File Commander` opens the commander directly from the module settings
* `Language` either follows Foundry's language (including community translations of this module) or forces English or German
* `Restore last session` remembers the panel state between openings
* `Show scene control button` toggles the scene control icon on the left side
* `Default left source` and `Default right source` define the initial storages when no earlier session is restored
* `Run self test` checks the file picker, every storage, the window and the clipboard. Run it after every Foundry update. When a newer Foundry than the tested one is installed, the GM gets a notice once
* `Save debug file` (GM) saves a file for bug reports, see [Debug file](#debug-file)

The gear in the title bar of the commander opens these settings.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for File Commander the available storages, whether the GM may browse and upload files, which roles may do so, whether the clipboard works and whether the commander is open. Macros call `game.modules.get("sephrals-file-commander").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub. If the GM agreed to the usage statistics, the window also counts how it is used: opened, the other modules shown, a video or install link of one of them, a module installed or switched on from it. It never records which module.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For the File Commander it holds:

* on how many of the last 30 days the module was used
* how often files are opened, paths are copied, files or folders are copied to the other pane, folders are created, files are uploaded, whole folders are uploaded, images are converted to WebP on upload, a panel is switched to the thumbnail grid, the Commander key commands are used and the self test runs
* the settings *Show scene control button*, *Restore last session*, *Default left source* and *Convert images to WebP on upload* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, chat messages, notes, dice results or other content of the world are sent.

## The Forge

On [The Forge](https://forge-vtt.com/) the commander adds your Assets Library to the source list. Browsing, copying, uploads and new folders work there, and files land in your Assets Library at the path shown in the panel. A panel whose default source is `User Data` starts in the Assets Library instead. Sessions restored from an earlier visit keep their source. Outside The Forge nothing changes.

## Macros

`game.modules.get("sephrals-file-commander").api` offers `open()`, which opens the commander, `runSelfTest()`, which runs the self test (GM), and `saveDebugFile()`, which saves the [debug file](#debug-file) (GM), and `samples()`, which lists sample windows and questions for the thumbnail grid, a running upload, empty and failing panes, the commander without upload right and the overwrite, new folder and sound questions. They show made-up folders, nothing is browsed, uploaded or saved. Sephral’s Translator lists them so translators see every text in its place.

## Intentional limits

Foundry does not let modules delete, move or rename files during a game session. File Commander therefore sticks to commands that work safely everywhere Foundry runs: browse, copy, upload and create folders.
