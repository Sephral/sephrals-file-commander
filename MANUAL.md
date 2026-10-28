# Sephral’s File Commander Manual

This manual covers the details. For a quick overview see the [README](README.md).

## Features

* Two panel browser for Foundry's storages: User Data, Public and S3
* Keyboard navigation in the style of the classic commanders with arrow keys, `Enter`, `Tab`, `Backspace` and `F3`
* Copy files and whole folders from one panel to the other
* Asks before a copy or upload overwrites an existing file. With several files you can apply the answer to all remaining files
* Folder creation in writable storages
* Local upload into the active panel
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

## Permissions

Opening the commander needs the Foundry permission to browse files. Copy, upload and new folders also need the permission to upload files. Without it these commands are shown disabled.

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

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For the File Commander it holds:

* on how many of the last 30 days the module was used
* how often files are opened, paths are copied, files or folders are copied to the other pane, folders are created, files are uploaded, the Commander key commands are used and the self test runs
* the settings *Show scene control button*, *Restore last session* and *Default left source* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## The Forge

On [The Forge](https://forge-vtt.com/) the commander adds your Assets Library to the source list. Browsing, copying, uploads and new folders work there, and files land in your Assets Library at the path shown in the panel. A panel whose default source is `User Data` starts in the Assets Library instead. Sessions restored from an earlier visit keep their source. Outside The Forge nothing changes.

## Macros

`game.modules.get("sephrals-file-commander").api` offers `open()`, which opens the commander, `runSelfTest()`, which runs the self test (GM), and `saveDebugFile()`, which saves the [debug file](#debug-file) (GM).

## Intentional limits

Foundry does not let modules delete, move or rename files during a game session. File Commander therefore sticks to commands that work safely everywhere Foundry runs: browse, copy, upload and create folders.
