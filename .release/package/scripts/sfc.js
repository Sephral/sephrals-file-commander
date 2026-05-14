const MODULE_ID = "sephrals-file-commander";
const STATE_SETTING = "windowState";
const RESTORE_STATE_SETTING = "restoreLastSession";
const SHOW_SCENE_CONTROL_SETTING = "showSceneControlButton";
const DEFAULT_LEFT_SOURCE_SETTING = "defaultLeftSource";
const DEFAULT_RIGHT_SOURCE_SETTING = "defaultRightSource";
const WRITABLE_SOURCES = new Set(["data", "s3"]);
const HOTKEY_PRECEDENCE = CONST.KEYBINDING_PRECEDENCE.NORMAL;

let fileCommanderApp = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, STATE_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
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
    onChange: () => openFileCommander(),
    tools: {
      open: {
        name: "open",
        title: localize("SFC.Controls.Open"),
        icon: "fa-solid fa-folder-open",
        order: 0,
        button: true,
        visible: true,
        onChange: () => openFileCommander()
      }
    }
  };
});

function openFileCommander() {
  if ( !fileCommanderApp ) fileCommanderApp = new SFCFileCommanderApp();
  fileCommanderApp.render(true);
  return fileCommanderApp;
}

class SFCOpenMenu extends FormApplication {
  render(force, options) {
    openFileCommander();
    return this;
  }

  async _updateObject() {}
}

class SFCFileCommanderApp extends Application {
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
    html.find("[data-action='view'], [data-action='copy'], [data-action='upload'], [data-action='mkdir'], [data-action='refresh'], [data-action='switch-pane']").on("click", event => this.#onToolbarAction(event));
    html.find(".sfc-path-row").on("submit", this.#onPathSubmit.bind(this));
    html.find("select[name='source']").on("change", event => this.#onSourceChange(event));
    html.find("select[name='bucket']").on("change", event => this.#onBucketChange(event));
    html.find(".sfc-entry").on("click", event => this.#onEntryClick(event));
    html.find(".sfc-entry").on("dblclick", event => this.#onEntryDoubleClick(event));
  }

  async close(options) {
    await this.#saveState();
    if ( fileCommanderApp === this ) fileCommanderApp = null;
    return super.close(options);
  }

  #buildCommandBar() {
    return [
      { key: "F3", label: localize("SFC.Command.View"), action: "view" },
      { key: "F4", label: localize("SFC.Command.Edit"), disabled: true },
      { key: "F5", label: localize("SFC.Command.Copy"), action: "copy" },
      { key: "F6", label: localize("SFC.Command.Move"), disabled: true },
      { key: "F7", label: localize("SFC.Command.Mkdir"), action: "mkdir" },
      { key: "F8", label: localize("SFC.Command.Delete"), disabled: true },
      { key: "Tab", label: localize("SFC.Command.Switch"), action: "switch-pane" },
      { key: "Ctrl+U", label: localize("SFC.Command.Upload"), action: "upload" }
    ];
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
    return Array.from(game.data.files?.storages ?? ["data"]);
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
    const target = normalizePath(path);

    try {
      if ( pane.source === "s3" && !pane.bucket ) {
        throw new Error(localize("SFC.Error.MissingBucket"));
      }

      const result = await this.#browseRaw(pane.source, target, pane.bucket);
      pane.path = normalizePath(result.target ?? target);
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
    return FilePicker.browse(source, target, options);
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
      if ( action === "refresh" ) await this.#refreshPanes();
      if ( action === "switch-pane" ) {
        this.#switchPane();
        await this.#saveState();
        this.render(false);
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
    await this.#saveState();
    this.#syncSelectionDisplay();
    this.#focusAppElement();
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
      event.preventDefault();
      this.#switchPane();
      await this.#saveState();
      this.render(false);
      return;
    }

    if ( event.key === "ArrowUp" ) {
      event.preventDefault();
      this.#moveSelection(activePane, -1);
      await this.#saveState();
      this.render(false);
      return;
    }

    if ( event.key === "ArrowDown" ) {
      event.preventDefault();
      this.#moveSelection(activePane, 1);
      await this.#saveState();
      this.render(false);
      return;
    }

    if ( event.key === "Home" ) {
      event.preventDefault();
      this.#selectAbsoluteIndex(activePane, 0);
      await this.#saveState();
      this.render(false);
      return;
    }

    if ( event.key === "End" ) {
      event.preventDefault();
      this.#selectAbsoluteIndex(activePane, this.state.panes[activePane].entries.length - 1);
      await this.#saveState();
      this.render(false);
      return;
    }

    if ( event.key === "Backspace" ) {
      event.preventDefault();
      await this.#browsePane(activePane, parentPath(this.state.panes[activePane].path));
      this.render(false);
      return;
    }

    if ( event.key === "ArrowLeft" ) {
      event.preventDefault();
      await this.#browsePane(activePane, parentPath(this.state.panes[activePane].path));
      this.render(false);
      return;
    }

    if ( event.key === "ArrowRight" ) {
      event.preventDefault();
      try {
        await this.#activateSelectedEntry(activePane);
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "Enter" ) {
      event.preventDefault();
      try {
        await this.#activateSelectedEntry(activePane);
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F3" ) {
      event.preventDefault();
      try {
        await this.#viewSelection();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F5" ) {
      event.preventDefault();
      try {
        await this.#copySelectionToOtherPane();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key === "F7" ) {
      event.preventDefault();
      try {
        await this.#createDirectoryInActivePane();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key.toLowerCase() === "r" && event.ctrlKey ) {
      event.preventDefault();
      try {
        await this.#refreshPanes();
      } catch (error) {
        this.#notifyError(error);
      }
      return;
    }

    if ( event.key.toLowerCase() === "u" && event.ctrlKey ) {
      event.preventDefault();
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

  #syncSelectionDisplay() {
    const root = this.element;
    if ( !root?.length ) return;

    const activePane = this.#getActivePaneKey();

    root.find(".sfc-pane").removeClass("is-active");
    root.find(`.sfc-pane[data-pane='${activePane}']`).addClass("is-active");

    for ( const side of ["left", "right"] ) {
      const pane = root.find(`.sfc-pane[data-pane='${side}']`);
      pane.find(".sfc-entry").removeClass("is-selected");
      pane.find(".sfc-entry").filter((_, element) => element.dataset.path === this.state.panes[side].selectedPath).addClass("is-selected");
    }
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

    window.open(toFetchUrl(selected.path), "_blank", "noopener");
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
    await this.#copyEntry(selection, sourcePane, targetPane, targetPane.path);
    await this.#browsePane(targetSide, targetPane.path, {keepSelection: true});
    ui.notifications?.info(localize("SFC.Notification.CopyFinished", {name: selection.label}));
    this.render(false);
  }

  async #copyEntry(entry, sourcePane, targetPane, targetDirectory) {
    if ( entry.type === "directory" ) {
      const nextDirectory = joinPath(targetDirectory, entry.name);
      await this.#ensureDirectory(targetPane, nextDirectory);

      const listing = await this.#browseRaw(sourcePane.source, entry.path, sourcePane.bucket);
      const entries = this.#mapEntries(entry.path, listing).filter(child => !child.isParent);
      for ( const child of entries ) {
        await this.#copyEntry(child, sourcePane, targetPane, nextDirectory);
      }
      return;
    }

    await this.#copyFile(entry, targetPane, targetDirectory);
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
    await FilePicker.upload(targetPane.source, targetDirectory, file, body, {notify: false});
  }

  async #ensureDirectory(pane, path) {
    if ( !this.#paneSupportsWrite(pane) ) throw new Error(localize("SFC.Error.NoWritableTarget"));

    const options = {};
    if ( pane.source === "s3" && pane.bucket ) options.bucket = pane.bucket;

    try {
      await FilePicker.createDirectory(pane.source, path, options);
    } catch (error) {
      if ( /already exists/i.test(error.message ?? "") ) return;
      throw error;
    }
  }

  async #createDirectoryInActivePane() {
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

    for ( const file of files ) {
      await FilePicker.upload(pane.source, pane.path, file, body, {notify: false});
    }

    await this.#browsePane(side, pane.path, {keepSelection: true});
    ui.notifications?.info(localize("SFC.Notification.UploadFinished", {count: files.length}));
    this.render(false);
  }

  #notifyError(error) {
    console.error(`${MODULE_ID} | operation failed`, error);
    ui.notifications?.error(localize("SFC.Notification.Error", {message: error.message ?? String(error)}));
  }
}

function localize(key, data) {
  return game.i18n.format(key, data ?? {});
}

function storageLabel(source) {
  return game.i18n.localize(`SFC.Storage.${source}`) || source;
}

function storageChoices() {
  return {
    data: storageLabel("data"),
    public: storageLabel("public"),
    s3: storageLabel("s3")
  };
}

function configuredDefaultSource(side, availableStorage) {
  const setting = side === "right" ? DEFAULT_RIGHT_SOURCE_SETTING : DEFAULT_LEFT_SOURCE_SETTING;
  const configured = game.settings.get(MODULE_ID, setting);
  if ( availableStorage.includes(configured) ) return configured;
  if ( availableStorage.includes("data") ) return "data";
  return availableStorage[0] ?? "data";
}

function compareEntries(left, right) {
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true });
}

function baseName(path) {
  const normalized = String(path ?? "").replace(/\/+$/, "");
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
  if ( /^(?:https?:)?\/\//i.test(path) ) return path;
  return foundry.utils.getRoute(path);
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
