const MODULE_ID = "sephrals-file-commander";
const DEFAULT_SCENE_CONTROL = "tokens";
const STATE_SETTING = "windowState";
const RESTORE_STATE_SETTING = "restoreLastSession";
const SHOW_SCENE_CONTROL_SETTING = "showSceneControlButton";
const UI_LANGUAGE_SETTING = "uiLanguage";
const DEFAULT_LEFT_SOURCE_SETTING = "defaultLeftSource";
const DEFAULT_RIGHT_SOURCE_SETTING = "defaultRightSource";
const SUPPORTED_UI_LANGUAGES = Object.freeze(["en", "de"]);
const DEFAULT_UI_LANGUAGE = "en";
// The Forge serves the user's Assets Library through this extra FilePicker source.
const FORGE_SOURCE = "forgevtt";
const WRITABLE_SOURCES = new Set(["data", "s3", FORGE_SOURCE]);
const ABSOLUTE_URL_PATTERN = /^(?:https?:)?\/\//i;
const HOTKEY_PRECEDENCE = CONST.KEYBINDING_PRECEDENCE.NORMAL;
// Selection changes save the window state only after the key presses settle.
const STATE_SAVE_DELAY = 300;
const MODULE_TRANSLATION_CACHE = new Map();
let MODULE_TRANSLATION_LOAD = null;

let fileCommanderApp = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, STATE_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, UI_LANGUAGE_SETTING, {
    name: game.i18n.localize("SFC.Settings.Language.Name"),
    hint: game.i18n.localize("SFC.Settings.Language.Hint"),
    scope: "client",
    config: true,
    type: String,
    default: "default",
    choices: {
      default: game.i18n.localize("SFC.Language.Default"),
      de: game.i18n.localize("SFC.Language.De"),
      en: game.i18n.localize("SFC.Language.En")
    },
    onChange: () => {
      void ensureModuleTranslationsLoaded().then(() => refreshLocalizedUi());
    }
  });

  game.settings.register(MODULE_ID, RESTORE_STATE_SETTING, {
    name: localize("SFC.Settings.RestoreState.Name"),
    hint: localize("SFC.Settings.RestoreState.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => {
      if ( !value ) void game.settings.set(MODULE_ID, STATE_SETTING, {});
    }
  });

  game.settings.register(MODULE_ID, SHOW_SCENE_CONTROL_SETTING, {
    name: localize("SFC.Settings.SceneControl.Name"),
    hint: localize("SFC.Settings.SceneControl.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => ui.controls?.render({reset: true})
  });

  game.settings.register(MODULE_ID, DEFAULT_LEFT_SOURCE_SETTING, {
    name: localize("SFC.Settings.DefaultLeft.Name"),
    hint: localize("SFC.Settings.DefaultLeft.Hint"),
    scope: "client",
    config: true,
    type: String,
    choices: storageChoices(),
    default: "data"
  });

  game.settings.register(MODULE_ID, DEFAULT_RIGHT_SOURCE_SETTING, {
    name: localize("SFC.Settings.DefaultRight.Name"),
    hint: localize("SFC.Settings.DefaultRight.Hint"),
    scope: "client",
    config: true,
    type: String,
    choices: storageChoices(),
    default: "public"
  });

  game.settings.registerMenu(MODULE_ID, "openFileCommander", {
    name: localize("SFC.Settings.Menu.Name"),
    label: localize("SFC.Settings.Menu.Label"),
    hint: localize("SFC.Settings.Menu.Hint"),
    icon: "fa-solid fa-table-columns",
    type: SFCOpenMenu,
    restricted: false
  });

  game.keybindings.register(MODULE_ID, "openFileCommander", {
    name: localize("SFC.Settings.Menu.Label"),
    hint: localize("SFC.Settings.Menu.Hint"),
    editable: [
      {
        key: "KeyO",
        modifiers: ["CONTROL", "SHIFT"]
      }
    ],
    precedence: HOTKEY_PRECEDENCE,
    onDown: () => {
      openFileCommander();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  void ensureModuleTranslationsLoaded();
});

Hooks.on("getSceneControlButtons", controls => {
  if ( !game.user?.isGM ) return;
  if ( !game.settings.get(MODULE_ID, SHOW_SCENE_CONTROL_SETTING) ) return;

  controls.fileCommander = {
    name: "fileCommander",
    title: localize("SFC.Controls.Title"),
    icon: "fa-solid fa-table-columns",
    visible: true,
    order: Object.keys(controls).length,
    activeTool: "open",
    onChange: (_event, active) => {
      if ( active ) toggleFileCommanderFromSceneControl();
    },
    tools: {
      open: {
        name: "open",
        title: localize("SFC.Controls.Open"),
        icon: "fa-solid fa-folder-open",
        order: 0,
        button: true,
        visible: true,
        onChange: (_event, active) => {
          if ( active ) toggleFileCommanderFromSceneControl();
        }
      }
    }
  };
});

Hooks.on("canvasReady", () => {
  installSceneControlClickFallback();
});

Hooks.on("renderSceneControls", () => {
  installSceneControlClickFallback();
});

function installSceneControlClickFallback() {
  if ( getFoundryGeneration() < 14 ) return;

  const button = document.querySelector("[data-control='fileCommander']");
  if ( !button ) return;
  if ( button.dataset.sfcClickFallbackInstalled === "true" ) return;

  button.dataset.sfcClickFallbackInstalled = "true";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void toggleFileCommanderFromSceneControl();
  });
}

function toggleFileCommanderFromSceneControl() {
  if ( fileCommanderApp ) {
    const app = fileCommanderApp;
    scheduleSceneControlRestore();
    return app.close({ force: true });
  }

  const app = openFileCommander();
  scheduleSceneControlRestore();
  return app;
}

function scheduleSceneControlRestore() {
  if ( typeof ui?.controls?.activate !== "function" ) return;
  if ( !ui.controls.controls?.[DEFAULT_SCENE_CONTROL] ) return;

  window.setTimeout(() => {
    if ( ui.controls.control?.name === DEFAULT_SCENE_CONTROL ) return;
    ui.controls.activate({ control: DEFAULT_SCENE_CONTROL });
  }, 25);
}

function openFileCommander() {
  // The server refuses every browse request without this permission, so the commander would only show errors.
  if ( !canBrowseFiles() ) {
    ui.notifications?.warn(localize("SFC.Error.NoBrowsePermission"));
    return null;
  }

  if ( !fileCommanderApp ) fileCommanderApp = new SFCFileCommanderApp();
  fileCommanderApp.options.title = localize("SFC.Title");
  fileCommanderApp.render(true);
  return fileCommanderApp;
}

function getFoundryGeneration() {
  const releaseGeneration = Number(game.release?.generation ?? NaN);
  if ( Number.isFinite(releaseGeneration) ) return releaseGeneration;

  const versionGeneration = Number.parseInt(String(game.version ?? "").split(".")[0] ?? "", 10);
  return Number.isFinite(versionGeneration) ? versionGeneration : 0;
}

// The global FilePicker is deprecated since v13. The configured implementation also covers replacements such as The Forge.
function getFilePickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

function canBrowseFiles() {
  return game.user?.can("FILES_BROWSE") === true;
}

// Uploads, copies and new folders all write through the upload route or createDirectory.
function canUploadFiles() {
  return game.user?.can("FILES_UPLOAD") === true;
}

class SFCOpenMenu extends FormApplication {
  render(force, options) {
    openFileCommander();
    return this;
  }

  async _updateObject() {}
}

class SFCFileCommanderApp extends Application {
  #queueStateSave = foundry.utils.debounce(() => void this.#saveState(), STATE_SAVE_DELAY);

  #audioPreview = null;

  constructor(options = {}) {
    super(options);
    this.state = this.#loadState();
    this.#ensurePaneDefaults("left");
    this.#ensurePaneDefaults("right");
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: MODULE_ID,
      title: localize("SFC.Title"),
      template: `modules/${MODULE_ID}/templates/file-commander.html`,
      width: 1360,
      height: 820,
      resizable: true,
      classes: ["sfc-window"]
    });
  }

  async getData() {
    await this.#ensurePaneLoaded("left");
    await this.#ensurePaneLoaded("right");

    return {
      labels: {
        copy: localize("SFC.Toolbar.Copy"),
        upload: localize("SFC.Toolbar.Upload"),
        mkdir: localize("SFC.Toolbar.NewFolder"),
        source: localize("SFC.Pane.Source"),
        bucket: localize("SFC.Pane.Bucket"),
        path: localize("SFC.Pane.Path"),
        refresh: localize("SFC.Toolbar.Refresh"),
        switchPane: localize("SFC.Toolbar.SwitchPane"),
        name: localize("SFC.Column.Name"),
        ext: localize("SFC.Column.Extension"),
        type: localize("SFC.Column.Type"),
        root: localize("SFC.Pane.Home"),
        up: localize("SFC.Pane.Up"),
        empty: localize("SFC.Pane.Empty")
      },
      commandBar: this.#buildCommandBar(),
      status: this.#statusText(),
      panes: {
        left: this.#serializePane("left"),
        right: this.#serializePane("right")
      }
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const app = html.find(".sfc-app");
    html.attr("tabindex", "0");
    app.attr("tabindex", "0");
    window.setTimeout(() => {
      html.trigger("focus");
      app.trigger("focus");
    }, 0);

    html.on("keydown", this.#onKeyDown.bind(this));
    app.on("keydown", this.#onKeyDown.bind(this));
    html.find(".sfc-pane").on("mousedown", event => this.#onPaneMouseDown(event));
    html.find("[data-action='view'], [data-action='copy'], [data-action='upload'], [data-action='mkdir'], [data-action='refresh'], [data-action='switch-pane'], [data-action='copy-path']").on("click", event => this.#onToolbarAction(event));
    html.find(".sfc-path-row").on("submit", this.#onPathSubmit.bind(this));
    html.find("select[name='source']").on("change", event => this.#onSourceChange(event));
    html.find("select[name='bucket']").on("change", event => this.#onBucketChange(event));
    html.find(".sfc-entry").on("click", event => this.#onEntryClick(event));
    html.find(".sfc-entry").on("dblclick", event => this.#onEntryDoubleClick(event));

    // A render rebuilds both lists scrolled to the top, so bring the selected rows back into view.
    window.setTimeout(() => {
      html.find(".sfc-entry.is-selected").each((_, row) => row.scrollIntoView?.({block: "nearest"}));
    }, 0);
  }

  async close(options) {
    this.#queueStateSave.cancel?.();
    await this.#saveState();
    if ( fileCommanderApp === this ) fileCommanderApp = null;
    return super.close(options);
  }

  #buildCommandBar() {
    const canUpload = canUploadFiles();
    const writeCommand = (key, label, action) => canUpload ? { key, label, action } : { key, label, disabled: true };

    return [
      { key: "F3", label: localize("SFC.Command.View"), action: "view" },
      { key: "F4", label: localize("SFC.Command.Edit"), disabled: true },
      writeCommand("F5", localize("SFC.Command.Copy"), "copy"),
      { key: "F6", label: localize("SFC.Command.Move"), disabled: true },
      writeCommand("F7", localize("SFC.Command.Mkdir"), "mkdir"),
      // Foundry has no client API to delete files, so F8 stays a placeholder like F4 and F6.
      { key: "F8", label: localize("SFC.Command.Delete"), disabled: true },
      { key: "Tab", label: localize("SFC.Command.Switch"), action: "switch-pane" },
      writeCommand("Ctrl+U", localize("SFC.Command.Upload"), "upload"),
      { key: "Ctrl+C", label: localize("SFC.Command.CopyPath"), action: "copy-path" }
    ];
  }

  #statusText() {
    const selection = this.#getSelectedEntry(this.#getActivePaneKey());
    if ( !selection ) return localize("SFC.Status.None");
    return localize("SFC.Status.Selection", {selection: selection.isParent ? selection.label : selection.path});
  }

  #loadState() {
    if ( !game.settings.get(MODULE_ID, RESTORE_STATE_SETTING) ) {
      return {
        activePane: "left",
        panes: {}
      };
    }

    const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, STATE_SETTING) ?? {});
    return {
      activePane: stored.activePane === "right" ? "right" : "left",
      panes: stored.panes ?? {}
    };
  }

  #ensurePaneDefaults(side) {
    const availableStorage = this.#storageOptions();
    const pane = this.state.panes[side] ?? {};
    const defaultSource = configuredDefaultSource(side, availableStorage);
    const source = availableStorage.includes(pane.source) ? pane.source : defaultSource;

    this.state.panes[side] = {
      source,
      bucket: pane.bucket ?? this.#defaultBucket(),
      path: normalizePath(pane.path),
      selectedPath: pane.selectedPath ?? "",
      entries: Array.isArray(pane.entries) ? pane.entries : [],
      directoryCount: 0,
      fileCount: 0,
      error: "",
      loaded: false
    };
  }

  async #saveState() {
    if ( !game.settings.get(MODULE_ID, RESTORE_STATE_SETTING) ) return;
    const payload = {
      activePane: this.state.activePane,
      panes: {
        left: this.#extractPersistedPane("left"),
        right: this.#extractPersistedPane("right")
      }
    };
    await game.settings.set(MODULE_ID, STATE_SETTING, payload);
  }

  #extractPersistedPane(side) {
    const pane = this.state.panes[side];
    return {
      source: pane.source,
      bucket: pane.bucket,
      path: pane.path,
      selectedPath: pane.selectedPath
    };
  }

  #serializePane(side) {
    const pane = this.state.panes[side];
    return {
      title: this.#paneTitle(side),
      activeClass: this.state.activePane === side ? "is-active" : "",
      storageLabel: storageLabel(pane.source),
      path: pane.path || "/",
      error: pane.error ? `${localize("SFC.Pane.ErrorPrefix")}: ${pane.error}` : "",
      showBucket: pane.source === "s3",
      sourceOptions: this.#storageOptions().map(value => ({
        value,
        label: storageLabel(value),
        selected: value === pane.source
      })),
      bucketOptions: this.#bucketOptions().map(value => ({
        value,
        label: value || "-",
        selected: value === pane.bucket
      })),
      entries: pane.entries.map(entry => ({
        ...entry,
        cssClass: [
          entry.type === "directory" ? "is-directory" : "is-file",
          entry.path === pane.selectedPath ? "is-selected" : "",
          entry.isParent ? "is-parent" : ""
        ].filter(Boolean).join(" ")
      })),
      summary: localize("SFC.Pane.Summary", {
        dirs: pane.directoryCount,
        files: pane.fileCount
      })
    };
  }

  #paneTitle(side) {
    return side === "left" ? localize("SFC.Pane.Left") : localize("SFC.Pane.Right");
  }

  #getActivePaneKey() {
    return this.state.activePane === "right" ? "right" : "left";
  }

  #getOtherPaneKey() {
    return this.#getActivePaneKey() === "left" ? "right" : "left";
  }

  #getSelectedEntry(side) {
    const pane = this.state.panes[side];
    return pane.entries.find(entry => entry.path === pane.selectedPath) ?? null;
  }

  #getSelectedIndex(side) {
    const pane = this.state.panes[side];
    return pane.entries.findIndex(entry => entry.path === pane.selectedPath);
  }

  #storageOptions() {
    return availableStorages();
  }

  #bucketOptions() {
    return Array.from(game.data.files?.s3?.buckets ?? []);
  }

  #defaultBucket() {
    return this.#bucketOptions()[0] ?? "";
  }

  #paneSupportsWrite(pane) {
    return WRITABLE_SOURCES.has(pane.source);
  }

  async #ensurePaneLoaded(side) {
    const pane = this.state.panes[side];
    if ( pane.loaded ) return;
    await this.#browsePane(side, pane.path, {keepSelection: true});
  }

  async #browsePane(side, path, {keepSelection = false} = {}) {
    const pane = this.state.panes[side];
    const target = normalizePath(toStoragePath(pane.source, path));

    try {
      if ( pane.source === "s3" && !pane.bucket ) {
        throw new Error(localize("SFC.Error.MissingBucket"));
      }

      const result = await this.#browseRaw(pane.source, target, pane.bucket);
      pane.path = normalizePath(toStoragePath(pane.source, result.target ?? target));
      pane.entries = this.#mapEntries(pane.path, result);
      pane.directoryCount = pane.entries.filter(entry => entry.type === "directory" && !entry.isParent).length;
      pane.fileCount = pane.entries.filter(entry => entry.type === "file").length;
      pane.error = "";
      pane.loaded = true;

      if ( !keepSelection || !pane.entries.some(entry => entry.path === pane.selectedPath) ) {
        pane.selectedPath = pane.entries[0]?.path ?? "";
      }
    } catch (error) {
      pane.entries = [];
      pane.directoryCount = 0;
      pane.fileCount = 0;
      pane.error = error.message ?? String(error);
      pane.loaded = true;
    }

    await this.#saveState();
  }

  async #browseRaw(source, target, bucket) {
    const options = {};
    if ( source === "s3" && bucket ) options.bucket = bucket;
    return getFilePickerClass().browse(source, target, options);
  }

  #mapEntries(currentPath, result) {
    const entries = [];

    if ( currentPath ) {
      entries.push({
        path: parentPath(currentPath),
        label: "[..]",
        name: "..",
        extension: "",
        type: "directory",
        typeLabel: localize("SFC.Entry.Parent"),
        isParent: true
      });
    }

    const directories = Array.from(result.dirs ?? [])
      .map(path => {
        const name = decodeName(baseName(path) || path);
        return {
          path,
          label: `[${name}]`,
          name,
          extension: "",
          type: "directory",
          typeLabel: localize("SFC.Entry.Directory"),
          isParent: false
        };
      })
      .sort(compareEntries);

    const files = Array.from(result.files ?? [])
      .map(path => {
        const name = decodeName(baseName(path) || path);
        return {
          path,
          label: name,
          name,
          extension: fileExtension(name),
          type: "file",
          typeLabel: localize("SFC.Entry.File"),
          isParent: false
        };
      })
      .sort(compareEntries);

    return entries.concat(directories, files);
  }

  async #onToolbarAction(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;

    try {
      if ( action === "view" ) await this.#viewSelection();
      if ( action === "copy" ) await this.#copySelectionToOtherPane();
      if ( action === "upload" ) await this.#uploadIntoActivePane();
      if ( action === "mkdir" ) await this.#createDirectoryInActivePane();
      if ( action === "copy-path" ) await this.#copySelectedPath();
      if ( action === "refresh" ) await this.#refreshPanes();
      if ( action === "switch-pane" ) {
        this.#switchPane();
        this.#applySelectionChange();
      }
    } catch (error) {
      this.#notifyError(error);
    }
  }

  #onPaneMouseDown(event) {
    const target = event.target;
    if ( target instanceof HTMLElement && target.closest("input, textarea, select") ) return;
    const side = event.currentTarget.dataset.pane;
    if ( side !== "left" && side !== "right" ) return;
    this.state.activePane = side;
    this.#syncSelectionDisplay();
  }

  async #onPathSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const side = form.dataset.pane;
    const input = form.querySelector("input[name='path']");
    this.state.activePane = side;

    try {
      await this.#browsePane(side, input?.value ?? "");
      this.render(false);
    } catch (error) {
      this.#notifyError(error);
    }
  }

  async #onSourceChange(event) {
    const side = event.currentTarget.dataset.pane;
    const pane = this.state.panes[side];
    pane.source = event.currentTarget.value;
    pane.bucket = pane.source === "s3" ? (pane.bucket || this.#defaultBucket()) : "";
    pane.path = "";
    pane.loaded = false;
    pane.selectedPath = "";
    this.state.activePane = side;

    await this.#browsePane(side, "");
    this.render(false);
  }

  async #onBucketChange(event) {
    const side = event.currentTarget.dataset.pane;
    const pane = this.state.panes[side];
    pane.bucket = event.currentTarget.value;
    pane.path = "";
    pane.loaded = false;
    pane.selectedPath = "";
    this.state.activePane = side;

    await this.#browsePane(side, "");
    this.render(false);
  }

  async #onEntryClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const side = button.dataset.pane;
    this.state.panes[side].selectedPath = button.dataset.path;
    this.state.activePane = side;
    this.#applySelectionChange();
  }

  async #onEntryDoubleClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const side = button.dataset.pane;
    const path = button.dataset.path;
    this.state.activePane = side;
    this.state.panes[side].selectedPath = path;

    try {
      await this.#activateSelectedEntry(side);
    } catch (error) {
      this.#notifyError(error);
    }
  }

  async #onKeyDown(event) {
    if ( !this.#shouldHandleNavigationKey(event) ) return;
    const activePane = this.#getActivePaneKey();

    if ( event.key === "Tab" ) {
      consumeKeyEvent(event);
      this.#switchPane();
      this.#applySelectionChange();
      return;
    }

    if ( event.key === "ArrowUp" ) {
      consumeKeyEvent(event);
      this.#moveSelection(activePane, -1);
      this.#applySelectionChange();
      return;
    }

    if ( event.key === "ArrowDown" ) {
      consumeKeyEvent(event);
      this.#moveSelection(activePane, 1);
      this.#applySelectionChange();
      return;
    }

    if ( event.key === "Home" ) {
      consumeKeyEvent(event);
      this.#selectAbsoluteIndex(activePane, 0);
      this.#applySelectionChange();
      return;
    }

    if ( event.key === "End" ) {
      consumeKeyEvent(event);
      this.#selectAbsoluteIndex(activePane, this.state.panes[activePane].entries.length - 1);
      this.#applySelectionChange();
      return;
    }

    if ( event.key === "Backspace" ) {
      consumeKeyEvent(event);
      await this.#browsePane(activePane, parentPath(this.state.panes[activePane].path));
      this.render(false);
      return;
    }

    if ( event.key === "ArrowLeft" ) {
      consumeKeyEvent(event);
      await this.#browsePane(activePane, parentPath(this.state.panes[activePane].path));
      this.render(false);
      return;
    }

    if ( event.key === "ArrowRight" ) {
      consumeKeyEvent(event);
      try {
        await this.#activateSelectedEntry(activePane);
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "Enter" ) {
      consumeKeyEvent(event);
      try {
        await this.#activateSelectedEntry(activePane);
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F3" ) {
      consumeKeyEvent(event);
      try {
        await this.#viewSelection();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F5" ) {
      consumeKeyEvent(event);
      try {
        await this.#copySelectionToOtherPane();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F7" ) {
      consumeKeyEvent(event);
      try {
        await this.#createDirectoryInActivePane();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key.toLowerCase() === "c" && event.ctrlKey ) {
      consumeKeyEvent(event);
      try {
        await this.#copySelectedPath();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key.toLowerCase() === "r" && event.ctrlKey ) {
      consumeKeyEvent(event);
      try {
        await this.#refreshPanes();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key.toLowerCase() === "u" && event.ctrlKey ) {
      consumeKeyEvent(event);
      try {
        await this.#uploadIntoActivePane();
      } catch (error) {
        this.#notifyError(error);
      }
    }
  }

  #shouldHandleNavigationKey(event) {
    const target = event.target;
    if ( !(target instanceof HTMLElement) ) return true;
    if ( target.closest("input, textarea, select") ) return false;
    return true;
  }

  #moveSelection(side, delta) {
    const entries = this.state.panes[side].entries;
    if ( !entries.length ) return;
    const currentIndex = Math.max(0, this.#getSelectedIndex(side));
    const nextIndex = Math.min(entries.length - 1, Math.max(0, currentIndex + delta));
    this.state.panes[side].selectedPath = entries[nextIndex].path;
  }

  #selectAbsoluteIndex(side, index) {
    const entries = this.state.panes[side].entries;
    if ( !entries.length ) return;
    const safeIndex = Math.min(entries.length - 1, Math.max(0, index));
    this.state.panes[side].selectedPath = entries[safeIndex].path;
  }

  #switchPane() {
    this.state.activePane = this.#getOtherPaneKey();
  }

  // Updates the rendered rows in place. A full render would reset the scroll position of long lists.
  #applySelectionChange() {
    this.#syncSelectionDisplay({scroll: true});
    this.#queueStateSave();
  }

  #syncSelectionDisplay({scroll = false} = {}) {
    const root = this.element;
    if ( !root?.length ) return;

    const activePane = this.#getActivePaneKey();

    root.find(".sfc-pane").removeClass("is-active");
    root.find(`.sfc-pane[data-pane='${activePane}']`).addClass("is-active");

    for ( const side of ["left", "right"] ) {
      const rows = root.find(`.sfc-pane[data-pane='${side}']`).find(".sfc-entry");
      rows.removeClass("is-selected");
      const selected = rows.filter((_, element) => element.dataset.path === this.state.panes[side].selectedPath).addClass("is-selected");
      if ( scroll && side === activePane ) selected.get(0)?.scrollIntoView?.({block: "nearest"});
    }

    const status = this.#statusText();
    root.find(".sfc-status-line").text(status).attr("title", status);
    this.#focusAppElement();
  }

  #focusAppElement() {
    const root = this.element;
    const app = root?.find(".sfc-app");
    if ( root?.length || app?.length ) {
      window.setTimeout(() => {
        root?.trigger("focus");
        app?.trigger("focus");
      }, 0);
    }
  }

  async #activateSelectedEntry(side) {
    const selected = this.#getSelectedEntry(side);
    if ( !selected ) return;

    if ( selected.type === "directory" ) {
      await this.#browsePane(side, selected.path, {keepSelection: false});
      this.render(false);
      return;
    }

    await this.#openFile(selected);
  }

  // Images and videos open in Foundry's image viewer (GMs can show them to players from there), audio plays in a
  // small dialog, everything else opens in a new browser tab.
  async #openFile(entry) {
    const url = toFetchUrl(entry.path);
    const kind = mediaKind(entry.name);
    const ImagePopout = foundry.applications?.apps?.ImagePopout;

    if ( (kind === "image" || kind === "video") && ImagePopout ) {
      await new ImagePopout({src: url, window: {title: entry.name}}).render({force: true});
      return;
    }

    if ( kind === "audio" ) {
      this.#playAudio(entry, url);
      return;
    }

    window.open(url, "_blank", "noopener");
  }

  #playAudio(entry, url) {
    // Only one preview plays at a time.
    void this.#audioPreview?.close();
    void foundry.applications.api.DialogV2.prompt({
      window: {title: entry.name, icon: "fa-solid fa-music"},
      classes: ["sfc-audio-preview"],
      content: `<audio controls autoplay src="${foundry.utils.escapeHTML(url)}"></audio>`,
      ok: {label: localize("SFC.Dialog.Audio.Close"), icon: "fa-solid fa-xmark"},
      render: (_event, dialog) => {
        this.#audioPreview = dialog;
      },
      close: (_event, dialog) => {
        if ( this.#audioPreview === dialog ) this.#audioPreview = null;
      }
    });
  }

  async #copySelectedPath() {
    const selection = this.#getSelectedEntry(this.#getActivePaneKey());
    if ( !selection || selection.isParent ) throw new Error(localize("SFC.Notification.NoSelection"));

    // The listed path is what Foundry's FilePicker writes into image and sound fields: relative for User Data
    // and Public, the full URL for S3 and The Forge.
    await copyTextToClipboard(selection.path);
    ui.notifications?.info(localize("SFC.Notification.PathCopied", {path: selection.path}));
  }

  #ensureUploadPermission() {
    if ( canUploadFiles() ) return true;
    ui.notifications?.warn(localize("SFC.Error.NoUploadPermission"));
    return false;
  }

  async #viewSelection() {
    const side = this.#getActivePaneKey();
    const selection = this.#getSelectedEntry(side);
    if ( !selection ) throw new Error(localize("SFC.Notification.NoSelection"));
    await this.#activateSelectedEntry(side);
  }

  async #refreshPanes() {
    await this.#browsePane("left", this.state.panes.left.path, {keepSelection: true});
    await this.#browsePane("right", this.state.panes.right.path, {keepSelection: true});
    this.render(false);
  }

  async #copySelectionToOtherPane() {
    if ( !this.#ensureUploadPermission() ) return;
    const sourceSide = this.#getActivePaneKey();
    const targetSide = this.#getOtherPaneKey();
    const sourcePane = this.state.panes[sourceSide];
    const targetPane = this.state.panes[targetSide];
    const selection = this.#getSelectedEntry(sourceSide);

    if ( !selection ) throw new Error(localize("SFC.Notification.NoSelection"));
    if ( selection.isParent ) throw new Error(localize("SFC.Notification.NoSelection"));
    if ( !this.#paneSupportsWrite(targetPane) ) throw new Error(localize("SFC.Error.NoWritableTarget"));
    if ( sourcePane.source === targetPane.source && sourcePane.bucket === targetPane.bucket && sourcePane.path === targetPane.path ) {
      throw new Error(localize("SFC.Error.SameTarget"));
    }

    ui.notifications?.info(localize("SFC.Notification.CopyStarted", {name: selection.label}));
    const run = createTransferRun(selection.type === "directory");
    await this.#copyEntry(selection, sourcePane, targetPane, targetPane.path, run);
    await this.#browsePane(targetSide, targetPane.path, {keepSelection: true});
    const finishedKey = run.cancelled ? "SFC.Notification.CopyCancelled" : "SFC.Notification.CopyFinished";
    ui.notifications?.info(localize(finishedKey, {name: selection.label}));
    this.#notifySkipped(run);
    this.render(false);
  }

  async #copyEntry(entry, sourcePane, targetPane, targetDirectory, run) {
    if ( run.cancelled ) return;

    if ( entry.type === "directory" ) {
      const nextDirectory = joinPath(targetDirectory, entry.name);
      // On The Forge the upload creates missing folders itself, so a failed createDirectory must not stop the copy.
      await this.#ensureDirectory(targetPane, nextDirectory, {ignoreErrors: targetPane.source === FORGE_SOURCE});

      const listing = await this.#browseRaw(sourcePane.source, toStoragePath(sourcePane.source, entry.path), sourcePane.bucket);
      const entries = this.#mapEntries(entry.path, listing).filter(child => !child.isParent);
      for ( const child of entries ) {
        await this.#copyEntry(child, sourcePane, targetPane, nextDirectory, run);
        if ( run.cancelled ) return;
      }
      return;
    }

    if ( !(await this.#confirmWrite(run, targetPane, targetDirectory, entry.name)) ) return;
    await this.#copyFile(entry, targetPane, targetDirectory);
  }

  // Resolves to true when the file may be written: no file of that name exists yet, or the user chose to overwrite it.
  async #confirmWrite(run, pane, directory, name) {
    const existing = await this.#existingFileNames(run, pane, directory);
    if ( !existing.has(fileNameKey(name)) ) return true;

    const decision = run.mode === "ask"
      ? applyOverwriteAnswer(run, await askOverwrite(name, directory, run.multiple))
      : run.mode;
    if ( decision === "skip" ) run.skipped += 1;
    return decision === "overwrite";
  }

  // Browses each target folder once per run. A folder that does not exist yet holds nothing to overwrite.
  async #existingFileNames(run, pane, directory) {
    const target = normalizePath(toStoragePath(pane.source, directory));
    if ( run.existing.has(target) ) return run.existing.get(target);

    let names;
    try {
      names = listingFileNames(await this.#browseRaw(pane.source, target, pane.bucket));
    } catch (_error) {
      names = new Set();
    }
    run.existing.set(target, names);
    return names;
  }

  #notifySkipped(run) {
    if ( run.skipped ) ui.notifications?.info(localize("SFC.Notification.SkippedExisting", {count: run.skipped}));
  }

  async #copyFile(entry, targetPane, targetDirectory) {
    const response = await fetch(toFetchUrl(entry.path));
    if ( !response.ok ) throw new Error(localize("SFC.Error.FetchFailed"));

    const blob = await response.blob();
    const file = new File([blob], entry.name, {
      type: blob.type || undefined,
      lastModified: Date.now()
    });

    const body = {};
    if ( targetPane.source === "s3" && targetPane.bucket ) body.bucket = targetPane.bucket;
    await getFilePickerClass().upload(targetPane.source, targetDirectory, file, body, {notify: false});
  }

  async #ensureDirectory(pane, path, {ignoreErrors = false} = {}) {
    if ( !this.#paneSupportsWrite(pane) ) throw new Error(localize("SFC.Error.NoWritableTarget"));

    const options = {};
    if ( pane.source === "s3" && pane.bucket ) options.bucket = pane.bucket;

    try {
      await getFilePickerClass().createDirectory(pane.source, path, options);
    } catch (error) {
      if ( /already exists/i.test(error.message ?? "") ) return;
      if ( ignoreErrors ) {
        console.warn(`${MODULE_ID} | could not create directory '${path}'`, error);
        return;
      }
      throw error;
    }
  }

  async #createDirectoryInActivePane() {
    if ( !this.#ensureUploadPermission() ) return;
    const side = this.#getActivePaneKey();
    const pane = this.state.panes[side];
    if ( !this.#paneSupportsWrite(pane) ) throw new Error(localize("SFC.Notification.CopyUnsupported"));

    const directoryName = await Dialog.prompt({
      title: localize("SFC.Dialog.NewFolder.Title"),
      content: `
        <form>
          <div class="form-group">
            <label>${localize("SFC.Dialog.NewFolder.Label")}</label>
            <input type="text" name="dirname" autofocus>
          </div>
        </form>
      `,
      label: localize("SFC.Dialog.NewFolder.Confirm"),
      callback: html => html.find("input[name='dirname']").val()?.trim()
    });

    if ( !directoryName ) return;

    const path = joinPath(pane.path, directoryName);
    await this.#ensureDirectory(pane, path);
    await this.#browsePane(side, pane.path, {keepSelection: true});
    ui.notifications?.info(localize("SFC.Notification.DirectoryCreated", {name: directoryName}));
    this.render(false);
  }

  async #uploadIntoActivePane() {
    if ( !this.#ensureUploadPermission() ) return;
    const side = this.#getActivePaneKey();
    const pane = this.state.panes[side];
    if ( !this.#paneSupportsWrite(pane) ) throw new Error(localize("SFC.Notification.CopyUnsupported"));

    const files = await chooseFiles();
    if ( !files.length ) {
      ui.notifications?.info(localize("SFC.Notification.Cancelled"));
      return;
    }

    const body = {};
    if ( pane.source === "s3" && pane.bucket ) body.bucket = pane.bucket;

    const run = createTransferRun(files.length > 1);
    let uploaded = 0;
    for ( const file of files ) {
      if ( run.cancelled ) break;
      if ( !(await this.#confirmWrite(run, pane, pane.path, file.name)) ) continue;
      await getFilePickerClass().upload(pane.source, pane.path, file, body, {notify: false});
      uploaded += 1;
    }

    await this.#browsePane(side, pane.path, {keepSelection: true});
    const finishedKey = run.cancelled ? "SFC.Notification.UploadCancelled" : "SFC.Notification.UploadFinished";
    ui.notifications?.info(localize(finishedKey, {count: uploaded}));
    this.#notifySkipped(run);
    this.render(false);
  }

  #notifyError(error) {
    console.error(`${MODULE_ID} | operation failed`, error);
    ui.notifications?.error(localize("SFC.Notification.Error", {message: error.message ?? String(error)}));
  }
}

function localize(key, data) {
  // Only an explicitly chosen module language overrides game.i18n. "Follow Foundry" leaves every string to
  // Foundry, which already merges the module's lang file, its English fallback and community translations.
  const preferredLanguage = getPreferredLanguage();
  const override = SUPPORTED_UI_LANGUAGES.includes(preferredLanguage)
    ? MODULE_TRANSLATION_CACHE.get(getModuleLanguage(preferredLanguage))?.[key]
    : undefined;
  if ( override ) return interpolateTemplate(override, data);
  return game.i18n.format(key, data ?? {});
}

function interpolateTemplate(template, data = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (_match, field) => {
    const replacement = data[field];
    return replacement === undefined || replacement === null ? `{${field}}` : String(replacement);
  });
}

function getRegisteredSettingValue(settingKey, fallback) {
  try {
    const value = game.settings.get(MODULE_ID, settingKey);
    return value === undefined ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

function normalizeUiLanguage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if ( !normalized ) return DEFAULT_UI_LANGUAGE;
  if ( SUPPORTED_UI_LANGUAGES.includes(normalized) ) return normalized;

  const baseLanguage = normalized.split(/[-_.]/)[0];
  return SUPPORTED_UI_LANGUAGES.includes(baseLanguage) ? baseLanguage : DEFAULT_UI_LANGUAGE;
}

function getPreferredLanguage() {
  return getRegisteredSettingValue(UI_LANGUAGE_SETTING, "default");
}

function getModuleLanguage(preferredLanguage = getPreferredLanguage()) {
  if ( SUPPORTED_UI_LANGUAGES.includes(preferredLanguage) ) return preferredLanguage;
  return normalizeUiLanguage(game.i18n?.lang);
}

async function loadModuleTranslations(language) {
  const normalized = normalizeUiLanguage(language);
  if ( MODULE_TRANSLATION_CACHE.has(normalized) ) return MODULE_TRANSLATION_CACHE.get(normalized);

  const response = await fetch(`modules/${MODULE_ID}/lang/${normalized}.json`);
  if ( !response.ok ) throw new Error(`Failed to load ${normalized} translations (${response.status})`);

  const translations = await response.json();
  MODULE_TRANSLATION_CACHE.set(normalized, translations);
  return translations;
}

async function ensureModuleTranslationsLoaded() {
  if ( !MODULE_TRANSLATION_LOAD ) {
    MODULE_TRANSLATION_LOAD = Promise.all(SUPPORTED_UI_LANGUAGES.map((language) => loadModuleTranslations(language)))
      .catch((error) => {
        console.warn(`${MODULE_ID} |`, error);
        return null;
      });
  }

  return MODULE_TRANSLATION_LOAD;
}

function refreshLocalizedUi() {
  if ( fileCommanderApp ) {
    fileCommanderApp.options.title = localize("SFC.Title");
    fileCommanderApp.render(true);
  }

  ui.controls?.render?.({ reset: true });
}

function storageLabel(source) {
  return game.i18n.localize(`SFC.Storage.${source}`) || source;
}

function storageChoices() {
  const choices = {
    data: storageLabel("data"),
    public: storageLabel("public"),
    s3: storageLabel("s3")
  };
  if ( !isUsingTheForge() ) return choices;
  return { [FORGE_SOURCE]: storageLabel(FORGE_SOURCE), ...choices };
}

function configuredDefaultSource(side, availableStorage) {
  const setting = side === "right" ? DEFAULT_RIGHT_SOURCE_SETTING : DEFAULT_LEFT_SOURCE_SETTING;
  const configured = game.settings.get(MODULE_ID, setting);
  if ( availableStorage.includes(configured) ) return forgeDefaultSource(configured, availableStorage);
  const fallback = forgeDefaultSource("data", availableStorage);
  if ( availableStorage.includes(fallback) ) return fallback;
  return availableStorage[0] ?? "data";
}

// On The Forge the Assets Library replaces "User Data" as the default storage.
function forgeDefaultSource(source, availableStorage) {
  if ( source !== "data" || !isUsingTheForge() ) return source;
  return availableStorage.includes(FORGE_SOURCE) ? FORGE_SOURCE : source;
}

function getForgeVTT() {
  // The Forge declares ForgeVTT as a script global, which is not necessarily a property of globalThis.
  return typeof ForgeVTT === "undefined" ? undefined : ForgeVTT;
}

function isUsingTheForge() {
  return getForgeVTT()?.usingTheForge === true;
}

function availableStorages() {
  const storages = Array.from(game.data.files?.storages ?? ["data"]);
  // game.data does not list The Forge's Assets Library source, so add it while running there.
  if ( isUsingTheForge() && !storages.includes(FORGE_SOURCE) ) storages.unshift(FORGE_SOURCE);
  return storages;
}

// The forgevtt source expects paths relative to the Assets Library root, but lists files as absolute URLs
// (`<ASSETS_LIBRARY_URL_PREFIX><user id>/<path>`). Turn such a URL back into its relative path; other sources keep it.
function toStoragePath(source, path) {
  const value = String(path ?? "");
  if ( source !== FORGE_SOURCE ) return value;

  const prefix = getForgeVTT()?.ASSETS_LIBRARY_URL_PREFIX;
  if ( !prefix || !value.startsWith(prefix) ) return value;
  return value.slice(prefix.length).split(/[?#]/)[0].split("/").slice(1).join("/");
}

function compareEntries(left, right) {
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true });
}

function baseName(path) {
  let normalized = String(path ?? "");
  // Absolute URLs (S3, The Forge Assets Library) may carry a query or hash that is not part of the name.
  if ( ABSOLUTE_URL_PATTERN.test(normalized) ) normalized = normalized.split(/[?#]/)[0];
  normalized = normalized.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
}

function parentPath(path) {
  const normalized = normalizePath(path);
  if ( !normalized ) return "";
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinPath(base, name) {
  return [normalizePath(base), normalizePath(name)].filter(Boolean).join("/");
}

function normalizePath(path) {
  return String(path ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(segment => segment && segment !== ".")
    .join("/");
}

function decodeName(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileExtension(name) {
  const index = name.lastIndexOf(".");
  if ( index <= 0 || index === name.length - 1 ) return "";
  return name.slice(index + 1).toLowerCase();
}

function toFetchUrl(path) {
  if ( ABSOLUTE_URL_PATTERN.test(path) ) return path;
  return foundry.utils.getRoute(path);
}

// Same lookup order as Foundry's FilePicker, so "webm" counts as video.
function mediaKind(name) {
  const extension = fileExtension(String(name ?? ""));
  if ( !extension ) return "";
  if ( Object.hasOwn(CONST.IMAGE_FILE_EXTENSIONS ?? {}, extension) ) return "image";
  if ( Object.hasOwn(CONST.VIDEO_FILE_EXTENSIONS ?? {}, extension) ) return "video";
  if ( Object.hasOwn(CONST.AUDIO_FILE_EXTENSIONS ?? {}, extension) ) return "audio";
  return "";
}

async function copyTextToClipboard(text) {
  if ( typeof game.clipboard?.copyPlainText === "function" ) return game.clipboard.copyPlainText(text);
  return navigator.clipboard.writeText(text);
}

// Foundry's keybindings listen on window and would act on the canvas behind the commander: the arrow keys pan
// or move tokens, Backspace deletes the controlled placeables, Tab cycles the view, Ctrl+C copies placeables.
function consumeKeyEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

// State of one copy or upload: the overwrite choice for the remaining files ("ask", "overwrite", "skip"),
// whether the user cancelled, how many files were skipped, and the cached names per target folder.
function createTransferRun(multiple) {
  return {
    multiple,
    mode: "ask",
    cancelled: false,
    skipped: 0,
    existing: new Map()
  };
}

// Names compare case-insensitively: on Windows "Map.png" would overwrite "map.png".
function fileNameKey(name) {
  return String(name ?? "").toLowerCase();
}

function listingFileNames(listing) {
  return new Set(Array.from(listing?.files ?? []).map(path => fileNameKey(decodeName(baseName(path)))));
}

// Turns the dialog answer into "overwrite", "skip" or "cancel" and remembers an "apply to all" choice for the run.
function applyOverwriteAnswer(run, answer) {
  const action = answer?.action;
  if ( action !== "overwrite" && action !== "skip" ) {
    run.cancelled = true;
    return "cancel";
  }
  if ( answer.all ) run.mode = action;
  return action;
}

async function askOverwrite(name, directory, multiple) {
  const escape = foundry.utils.escapeHTML;
  const message = localize("SFC.Dialog.Overwrite.Content", {name, path: directory || "/"});
  const applyAll = multiple ? `
    <div class="form-group">
      <label for="sfc-overwrite-apply-all">${escape(localize("SFC.Dialog.Overwrite.ApplyAll"))}</label>
      <input type="checkbox" id="sfc-overwrite-apply-all" name="applyAll">
    </div>
  ` : "";
  const answer = action => (_event, button) => ({action, all: button.form?.elements.applyAll?.checked === true});

  // A single file has nothing to skip to, so it only offers overwrite or cancel.
  const buttons = [
    {action: "overwrite", label: localize("SFC.Dialog.Overwrite.Overwrite"), icon: "fa-solid fa-floppy-disk", callback: answer("overwrite")},
    multiple ? {action: "skip", label: localize("SFC.Dialog.Overwrite.Skip"), icon: "fa-solid fa-forward", callback: answer("skip"), default: true} : null,
    {action: "cancel", label: localize("SFC.Dialog.Overwrite.Cancel"), icon: "fa-solid fa-xmark", default: !multiple}
  ].filter(Boolean);

  return foundry.applications.api.DialogV2.wait({
    window: {title: localize("SFC.Dialog.Overwrite.Title"), icon: "fa-solid fa-triangle-exclamation"},
    position: {width: 440},
    content: `<p>${escape(message)}</p>${applyAll}`,
    buttons,
    rejectClose: false
  });
}

async function chooseFiles() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    let resolved = false;
    const finish = files => {
      if ( resolved ) return;
      resolved = true;
      window.removeEventListener("focus", onFocus, true);
      resolve(files);
    };
    const onFocus = () => {
      window.setTimeout(() => finish(Array.from(input.files ?? [])), 250);
    };

    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    window.addEventListener("focus", onFocus, true);
    input.click();
  });
}

export const __test__ = {
  MODULE_ID,
  DEFAULT_SCENE_CONTROL,
  STATE_SETTING,
  RESTORE_STATE_SETTING,
  SHOW_SCENE_CONTROL_SETTING,
  UI_LANGUAGE_SETTING,
  DEFAULT_LEFT_SOURCE_SETTING,
  DEFAULT_RIGHT_SOURCE_SETTING,
  SUPPORTED_UI_LANGUAGES,
  FORGE_SOURCE,
  WRITABLE_SOURCES,
  HOTKEY_PRECEDENCE,
  STATE_SAVE_DELAY,
  MODULE_TRANSLATION_CACHE,
  getFoundryGeneration,
  canBrowseFiles,
  canUploadFiles,
  installSceneControlClickFallback,
  toggleFileCommanderFromSceneControl,
  openFileCommander,
  SFCOpenMenu,
  SFCFileCommanderApp,
  localize,
  normalizeUiLanguage,
  getPreferredLanguage,
  getModuleLanguage,
  ensureModuleTranslationsLoaded,
  refreshLocalizedUi,
  storageLabel,
  storageChoices,
  configuredDefaultSource,
  isUsingTheForge,
  availableStorages,
  toStoragePath,
  compareEntries,
  baseName,
  parentPath,
  joinPath,
  normalizePath,
  decodeName,
  fileExtension,
  toFetchUrl,
  mediaKind,
  copyTextToClipboard,
  consumeKeyEvent,
  createTransferRun,
  fileNameKey,
  listingFileNames,
  applyOverwriteAnswer,
  askOverwrite,
  chooseFiles
};
