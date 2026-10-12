# Sephral’s File Commander

Sephral’s File Commander is a two-pane file manager for Foundry VTT with a classic commander-style workflow. It uses Foundry’s own storage APIs so browsing, copying, uploads, and directory creation stay portable across Windows, Linux, macOS, and hosted setups.

## Foundry VTT

[![Foundry VTT package](https://img.shields.io/badge/Foundry%20VTT-Package%20page-fe6a1f?logo=foundryvirtualtabletop&logoColor=white)](https://foundryvtt.com/packages/sephrals-file-commander)

Install the module from the package browser in Foundry VTT or open its [package page on foundryvtt.com](https://foundryvtt.com/packages/sephrals-file-commander).

## Discord

[![Join Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/7BjCgDYaBP)

Questions, feedback, and module support are welcome on [Discord](https://discord.gg/7BjCgDYaBP).

## Demo

![SCBR demo](media/demo.gif)

If the embedded preview is not available in your GitHub view, please check the media folder.

## Current feature set

- Two-pane browser for Foundry storages such as `data`, `public`, and `s3`
- Commander-style keyboard navigation with arrow keys, `Enter`, `Tab`, `Backspace`, and `F3`
- Recursive copy from one pane to the other
- Asks before a copy or upload overwrites an existing file. With several files you can apply the answer to all remaining files
- Directory creation in writable storages
- Local upload into the active pane
- Images and videos open in Foundry's image viewer, audio files play in a small player
- `Ctrl+C` copies the path of the selected entry in the form Foundry's file picker uses: a relative path for User Data and Public, the full URL for S3 and The Forge. Paste it into token images, tiles, or playlist sounds
- A status line shows the path of the selected entry
- Direct access from Foundry settings and a scene-control icon on the left side

## Permissions

Opening the commander needs the Foundry permission to browse files. Copy, upload, and new folders also need the permission to upload files. Without it these commands are shown disabled.

## Settings

- `Open File Commander` opens the commander directly from module settings
- `Language` either follows Foundry's language (including community translations of this module) or forces English or German
- `Restore last session` remembers pane state between openings
- `Show scene control button` toggles the left-side scene-control icon
- `Default left source` and `Default right source` define the initial storages when no prior session is restored

## The Forge

On [The Forge](https://forge-vtt.com/) the commander adds your Assets Library (FilePicker source `forgevtt`) to the source list, even though Foundry itself does not list it. It is treated as writable, so browsing, copying, uploads, and new folders work there, and files you copy or upload into it are stored in your Assets Library at the path shown in the pane. A pane whose default source is `User Data` starts in the Assets Library instead. Sessions restored from an earlier visit keep their source. Outside The Forge nothing changes.

## Intentional limits of this version

Foundry core exposes browse, upload, and directory creation APIs, but it does not expose equivalent safe client APIs for delete, move, or rename operations in a world session. This module therefore starts with safe, portable commands that work everywhere Foundry runs.

## Hotkeys inside the commander

- `ArrowUp` / `ArrowDown` move the selection
- `Home` / `End` jump to the first or last entry
- `ArrowLeft` or `Backspace` go to the parent directory
- `ArrowRight` or `Enter` open the selected directory or file
- `F3` views the selected entry: images and videos in Foundry's image viewer, audio in a small player, other files in a new browser tab
- `Tab` switches the active pane
- `Ctrl+R` refreshes both panes
- `Ctrl+C` copies the path of the selected entry
- `F5` copies the selected entry to the opposite pane
- `F7` creates a directory in the active pane
- `Ctrl+U` uploads files into the active pane
