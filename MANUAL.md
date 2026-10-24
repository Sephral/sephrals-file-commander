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

The gear in the title bar of the commander opens these settings.

## The Forge

On [The Forge](https://forge-vtt.com/) the commander adds your Assets Library to the source list. Browsing, copying, uploads and new folders work there, and files land in your Assets Library at the path shown in the panel. A panel whose default source is `User Data` starts in the Assets Library instead. Sessions restored from an earlier visit keep their source. Outside The Forge nothing changes.

## Macros

`game.modules.get("sephrals-file-commander").api` offers `open()`, which opens the commander, and `runSelfTest()`, which runs the self test (GM).

## Intentional limits

Foundry does not let modules delete, move or rename files during a game session. File Commander therefore sticks to commands that work safely everywhere Foundry runs: browse, copy, upload and create folders.
