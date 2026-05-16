import path from "node:path";
import { pathToFileURL } from "node:url";

export class TestElement {
  constructor({ dataset = {}, value = "", textContent = "" } = {}) {
    this.dataset = { ...dataset };
    this.value = value;
    this.textContent = textContent;
    this.classes = new Set();
    this.attributes = {};
    this.handlers = new Map();
    this.finders = new Map();
  }

  on(event, handler) {
    const bucket = this.handlers.get(event) ?? [];
    bucket.push(handler);
    this.handlers.set(event, bucket);
  }

  addEventListener(event, handler) {
    this.on(event, handler);
  }

  trigger(event, extra = {}) {
    const eventObject = {
      currentTarget: this,
      target: extra.target ?? this,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra
    };

    for (const handler of this.handlers.get(event) ?? []) {
      handler(eventObject);
    }

    return eventObject;
  }

  addClass(name) {
    this.classes.add(name);
  }

  removeClass(name) {
    this.classes.delete(name);
  }

  hasClass(name) {
    return this.classes.has(name);
  }

  attr(name, value) {
    this.attributes[name] = value;
  }

  setFind(selector, collection) {
    this.finders.set(selector, collection);
  }

  find(selector) {
    return this.finders.get(selector) ?? new JQueryCollection([]);
  }

  querySelector(selector) {
    return this.querySelectorMap?.get(selector) ?? null;
  }

  setQuerySelector(selector, value) {
    this.querySelectorMap ??= new Map();
    this.querySelectorMap.set(selector, value);
  }

  closest(selector) {
    return this.closestHandler ? this.closestHandler(selector) : null;
  }

  setClosest(handler) {
    this.closestHandler = handler;
  }
}

export class JQueryCollection {
  constructor(elements = [], root = null) {
    this.elements = elements;
    this.root = root;
    this.length = elements.length;
  }

  on(event, handler) {
    for (const element of this.elements) element.on(event, handler);
    return this;
  }

  attr(name, value) {
    for (const element of this.elements) element.attr(name, value);
    return this;
  }

  trigger(event, extra = {}) {
    for (const element of this.elements) element.trigger(event, extra);
    return this;
  }

  removeClass(name) {
    for (const element of this.elements) element.removeClass(name);
    return this;
  }

  addClass(name) {
    for (const element of this.elements) element.addClass(name);
    return this;
  }

  filter(predicate) {
    return new JQueryCollection(this.elements.filter((element, index) => predicate(index, element)), this.root);
  }

  find(selector) {
    const nested = [];
    for (const element of this.elements) {
      nested.push(...element.find(selector).elements);
    }
    return new JQueryCollection(nested, this.root);
  }

  get(index) {
    return this.elements[index];
  }
}

function createHooksStub() {
  const onceHandlers = new Map();
  const onHandlers = new Map();

  return {
    once(event, handler) {
      const bucket = onceHandlers.get(event) ?? [];
      bucket.push(handler);
      onceHandlers.set(event, bucket);
    },
    on(event, handler) {
      const bucket = onHandlers.get(event) ?? [];
      bucket.push(handler);
      onHandlers.set(event, bucket);
    },
    async trigger(event, ...args) {
      for (const handler of onceHandlers.get(event) ?? []) await handler(...args);
      for (const handler of onHandlers.get(event) ?? []) await handler(...args);
    }
  };
}

export function modulePath(relativePath) {
  const absolute = path.resolve("d:\\_Projekte\\_Foundry-Development\\FoundryVTT_Module\\sephrals-file-commander", relativePath);
  return pathToFileURL(absolute).href;
}

export async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

export function createHtmlHarness() {
  const root = new TestElement();
  const app = new TestElement();
  const leftPane = new TestElement({ dataset: { pane: "left" } });
  const rightPane = new TestElement({ dataset: { pane: "right" } });
  const viewButton = new TestElement({ dataset: { action: "view" } });
  const copyButton = new TestElement({ dataset: { action: "copy" } });
  const uploadButton = new TestElement({ dataset: { action: "upload" } });
  const mkdirButton = new TestElement({ dataset: { action: "mkdir" } });
  const deleteButton = new TestElement({ dataset: { action: "delete" } });
  const refreshButton = new TestElement({ dataset: { action: "refresh" } });
  const switchButton = new TestElement({ dataset: { action: "switch-pane" } });
  const leftForm = new TestElement({ dataset: { pane: "left" } });
  const rightForm = new TestElement({ dataset: { pane: "right" } });
  const leftInput = new TestElement({ value: "left/path" });
  const rightInput = new TestElement({ value: "right/path" });
  leftForm.setQuerySelector("input[name='path']", leftInput);
  rightForm.setQuerySelector("input[name='path']", rightInput);
  const leftSource = new TestElement({ dataset: { pane: "left" }, value: "data" });
  const rightSource = new TestElement({ dataset: { pane: "right" }, value: "public" });
  const leftBucket = new TestElement({ dataset: { pane: "left" }, value: "bucket-a" });
  const rightBucket = new TestElement({ dataset: { pane: "right" }, value: "bucket-b" });
  const leftEntry = new TestElement({ dataset: { pane: "left", path: "folder-a", entryType: "directory" } });
  const rightEntry = new TestElement({ dataset: { pane: "right", path: "file-b.txt", entryType: "file" } });

  leftPane.setFind(".sfc-entry", new JQueryCollection([leftEntry], root));
  rightPane.setFind(".sfc-entry", new JQueryCollection([rightEntry], root));

  const allEntries = new JQueryCollection([leftEntry, rightEntry], root);
  const allPanes = new JQueryCollection([leftPane, rightPane], root);
  const toolbar = new JQueryCollection([viewButton, copyButton, uploadButton, mkdirButton, deleteButton, refreshButton, switchButton], root);
  const pathRows = new JQueryCollection([leftForm, rightForm], root);
  const sourceSelects = new JQueryCollection([leftSource, rightSource], root);
  const bucketSelects = new JQueryCollection([leftBucket, rightBucket], root);

  root.find = (selector) => {
    if (selector === ".sfc-app") return new JQueryCollection([app], root);
    if (selector === ".sfc-pane") return allPanes;
    if (selector === ".sfc-entry") return allEntries;
    if (selector === ".sfc-path-row") return pathRows;
    if (selector === "select[name='source']") return sourceSelects;
    if (selector === "select[name='bucket']") return bucketSelects;
    if (selector === "[data-action='view'], [data-action='copy'], [data-action='upload'], [data-action='mkdir'], [data-action='delete'], [data-action='refresh'], [data-action='switch-pane']") return toolbar;
    const paneMatch = /^\.sfc-pane\[data-pane='(left|right)'\]$/.exec(selector);
    if (paneMatch) return paneMatch[1] === "left" ? new JQueryCollection([leftPane], root) : new JQueryCollection([rightPane], root);
    return new JQueryCollection([], root);
  };

  return {
    root: new JQueryCollection([root], root),
    controls: {
      app,
      leftPane,
      rightPane,
      viewButton,
      copyButton,
      uploadButton,
      mkdirButton,
      deleteButton,
      refreshButton,
      switchButton,
      leftForm,
      rightForm,
      leftInput,
      rightInput,
      leftSource,
      rightSource,
      leftBucket,
      rightBucket,
      leftEntry,
      rightEntry
    }
  };
}

export function createTestEnvironment() {
  const state = {
    registerCalls: [],
    registerMenuCalls: [],
    keybindingCalls: [],
    settingWrites: [],
    settingsValues: new Map(),
    notifications: { info: [], error: [] },
    controlRenders: [],
    controlActivations: [],
    browseCalls: [],
    uploadCalls: [],
    createDirectoryCalls: [],
    deleteCalls: [],
    browseResults: new Map(),
    createDirectoryErrors: new Map(),
    promptValue: null,
    localizations: new Map(),
    windowOpenCalls: [],
    windowEventHandlers: new Map(),
    createdInputs: [],
    setTimeoutCalls: []
  };

  const hooks = createHooksStub();

  class TestApplication {
    constructor(options = {}) {
      this.options = options;
      this.position = {};
      this.element = null;
      this.renderCalls = [];
    }

    static get defaultOptions() {
      return { base: true, classes: ["base-app"] };
    }

    render(force) {
      this.renderCalls.push(force);
      return this;
    }

    async close(options) {
      this.closedWith = options;
      return { closed: true, options };
    }

    activateListeners(_html) {}
  }

  class TestFormApplication extends TestApplication {}

  const foundry = {
    utils: {
      deepClone(value) {
        return structuredClone(value);
      },
      mergeObject(target, source) {
        return { ...(target ?? {}), ...(source ?? {}) };
      },
      getRoute(path) {
        return `/route/${path}`;
      }
    }
  };

  const FilePicker = {
    async browse(source, target, options = {}) {
      state.browseCalls.push({ source, target, options });
      const key = `${source}|${target}|${options.bucket ?? ""}`;
      if (!state.browseResults.has(key)) return { target, dirs: [], files: [] };
      const result = state.browseResults.get(key);
      if (result instanceof Error) throw result;
      return result;
    },
    async upload(source, target, file, body, options) {
      state.uploadCalls.push({ source, target, file, body, options });
      return { path: `${target}/${file.name}` };
    },
    async createDirectory(source, path, options) {
      state.createDirectoryCalls.push({ source, path, options });
      if (state.createDirectoryErrors.has(path)) throw state.createDirectoryErrors.get(path);
      return true;
    },
    async delete(source, target, options) {
      state.deleteCalls.push({ source, target, options });
      return true;
    }
  };

  const game = {
    i18n: {
      lang: "en",
      localize(key) {
        return state.localizations.get(key) ?? key;
      },
      format(key, data = {}) {
        const template = state.localizations.get(key) ?? key;
        return Object.entries(data).reduce((result, [token, value]) => result.replaceAll(`{${token}}`, value), template);
      }
    },
    settings: {
      register(moduleId, key, data) {
        state.registerCalls.push({ moduleId, key, data });
      },
      registerMenu(moduleId, key, data) {
        state.registerMenuCalls.push({ moduleId, key, data });
      },
      get(moduleId, key) {
        return state.settingsValues.get(`${moduleId}.${key}`);
      },
      async set(moduleId, key, value) {
        state.settingWrites.push({ moduleId, key, value });
        state.settingsValues.set(`${moduleId}.${key}`, value);
        return value;
      }
    },
    keybindings: {
      register(moduleId, key, data) {
        state.keybindingCalls.push({ moduleId, key, data });
      }
    },
    data: {
      release: { generation: 14 },
      files: {
        storages: ["data", "public", "s3"],
        s3: { buckets: ["bucket-a", "bucket-b"] }
      }
    },
    release: { generation: 14 },
    user: { isGM: true }
  };

  const ui = {
    controls: {
      control: { name: "tokens" },
      controls: {
        tokens: { name: "tokens" }
      },
      activate(options) {
        state.controlActivations.push(options);
        this.control = { name: options.control };
      },
      render(options) {
        state.controlRenders.push(options);
      }
    },
    notifications: {
      info(message) {
        state.notifications.info.push(message);
      },
      error(message) {
        state.notifications.error.push(message);
      }
    }
  };

  const Dialog = {
    async prompt(options) {
      state.lastPromptOptions = options;
      return typeof state.promptValue === "function" ? state.promptValue(options) : state.promptValue;
    }
  };

  const windowObject = {
    setTimeout(handler, delay) {
      state.setTimeoutCalls.push(delay);
      handler();
      return 1;
    },
    open(url, target, features) {
      state.windowOpenCalls.push({ url, target, features });
    },
    addEventListener(type, handler) {
      const bucket = state.windowEventHandlers.get(type) ?? [];
      bucket.push(handler);
      state.windowEventHandlers.set(type, bucket);
    },
    removeEventListener(type, handler) {
      const bucket = state.windowEventHandlers.get(type) ?? [];
      state.windowEventHandlers.set(type, bucket.filter((entry) => entry !== handler));
    },
    trigger(type) {
      for (const handler of state.windowEventHandlers.get(type) ?? []) handler();
    }
  };

  const document = {
    createElement(tag) {
      const element = new TestElement();
      element.tagName = tag;
      element.click = () => {
        element.clicked = true;
      };
      state.createdInputs.push(element);
      return element;
    }
  };

  globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
  globalThis.Hooks = hooks;
  globalThis.Application = TestApplication;
  globalThis.FormApplication = TestFormApplication;
  globalThis.foundry = foundry;
  globalThis.FilePicker = FilePicker;
  globalThis.game = game;
  globalThis.ui = ui;
  globalThis.Dialog = Dialog;
  globalThis.window = windowObject;
  globalThis.document = document;
  globalThis.HTMLElement = TestElement;

  state.localizations = new Map([
    ["SFC.Settings.RestoreState.Name", "Restore state"],
    ["SFC.Settings.RestoreState.Hint", "Restore hint"],
    ["SFC.Settings.SceneControl.Name", "Scene control"],
    ["SFC.Settings.SceneControl.Hint", "Scene control hint"],
    ["SFC.Settings.DefaultLeft.Name", "Left source"],
    ["SFC.Settings.DefaultLeft.Hint", "Left hint"],
    ["SFC.Settings.DefaultRight.Name", "Right source"],
    ["SFC.Settings.DefaultRight.Hint", "Right hint"],
    ["SFC.Settings.Menu.Name", "Menu name"],
    ["SFC.Settings.Menu.Label", "Open Commander"],
    ["SFC.Settings.Menu.Hint", "Menu hint"],
    ["SFC.Settings.Language.Name", "Language"],
    ["SFC.Settings.Language.Hint", "Language hint"],
    ["SFC.Language.Default", "Follow Foundry"],
    ["SFC.Language.De", "Deutsch"],
    ["SFC.Language.En", "English"],
    ["SFC.Title", "File Commander"],
    ["SFC.Toolbar.Copy", "Copy"],
    ["SFC.Toolbar.Upload", "Upload"],
    ["SFC.Toolbar.NewFolder", "New Folder"],
    ["SFC.Pane.Source", "Source"],
    ["SFC.Pane.Bucket", "Bucket"],
    ["SFC.Pane.Path", "Path"],
    ["SFC.Toolbar.Refresh", "Refresh"],
    ["SFC.Toolbar.SwitchPane", "Switch Pane"],
    ["SFC.Column.Name", "Name"],
    ["SFC.Column.Extension", "Ext"],
    ["SFC.Column.Type", "Type"],
    ["SFC.Pane.Home", "Home"],
    ["SFC.Pane.Up", "Up"],
    ["SFC.Pane.Empty", "Empty"],
    ["SFC.Command.View", "View"],
    ["SFC.Command.Edit", "Edit"],
    ["SFC.Command.Copy", "Copy"],
    ["SFC.Command.Move", "Move"],
    ["SFC.Command.Mkdir", "MkDir"],
    ["SFC.Command.Delete", "Delete"],
    ["SFC.Command.Switch", "Switch"],
    ["SFC.Command.Upload", "Upload"],
    ["SFC.Pane.Left", "Left Pane"],
    ["SFC.Pane.Right", "Right Pane"],
    ["SFC.Pane.ErrorPrefix", "Error"],
    ["SFC.Pane.Summary", "{dirs} dirs, {files} files"],
    ["SFC.Entry.Parent", "Parent"],
    ["SFC.Entry.Directory", "Directory"],
    ["SFC.Entry.File", "File"],
    ["SFC.Notification.NoSelection", "no selection"],
    ["SFC.Notification.CopyStarted", "copy started {name}"],
    ["SFC.Notification.CopyFinished", "copy finished {name}"],
    ["SFC.Notification.CopyUnsupported", "copy unsupported"],
    ["SFC.Notification.DeleteFinished", "deleted {name}"],
    ["SFC.Notification.DirectoryCreated", "directory created {name}"],
    ["SFC.Notification.UploadFinished", "upload finished {count}"],
    ["SFC.Notification.Cancelled", "cancelled"],
    ["SFC.Notification.Error", "error {message}"],
    ["SFC.Error.DeleteFilesOnly", "delete files only"],
    ["SFC.Error.DeleteUnsupported", "delete unsupported"],
    ["SFC.Error.NoWritableTarget", "no writable target"],
    ["SFC.Error.FetchFailed", "fetch failed"],
    ["SFC.Error.MissingBucket", "missing bucket"],
    ["SFC.Error.SameTarget", "same target"],
    ["SFC.Dialog.NewFolder.Title", "Create Directory"],
    ["SFC.Dialog.NewFolder.Label", "Directory name"],
    ["SFC.Dialog.NewFolder.Confirm", "Create"],
    ["SFC.Storage.data", "User Data"],
    ["SFC.Storage.public", "Public"],
    ["SFC.Storage.s3", "S3"],
    ["SFC.Controls.Title", "File Commander"],
    ["SFC.Controls.Open", "Open File Commander"]
  ]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["file"], { type: "text/plain" }) });

  return {
    state,
    hooks,
    game,
    reset() {
      state.registerCalls = [];
      state.registerMenuCalls = [];
      state.keybindingCalls = [];
      state.settingWrites = [];
      state.notifications = { info: [], error: [] };
      state.controlRenders = [];
      state.controlActivations = [];
      state.browseCalls = [];
      state.uploadCalls = [];
      state.createDirectoryCalls = [];
      state.deleteCalls = [];
      state.browseResults = new Map();
      state.createDirectoryErrors = new Map();
      state.promptValue = null;
      state.windowOpenCalls = [];
      state.windowEventHandlers = new Map();
      state.createdInputs = [];
      state.setTimeoutCalls = [];
      state.lastPromptOptions = null;
      state.settingsValues = new Map([
        ["sephrals-file-commander.uiLanguage", "default"],
        ["sephrals-file-commander.restoreLastSession", true],
        ["sephrals-file-commander.windowState", {}],
        ["sephrals-file-commander.showSceneControlButton", true],
        ["sephrals-file-commander.defaultLeftSource", "data"],
        ["sephrals-file-commander.defaultRightSource", "public"]
      ]);
      ui.controls.control = { name: "tokens" };
      ui.controls.controls = { tokens: { name: "tokens" } };
      game.user.isGM = true;
      game.release = { generation: 14 };
      game.i18n.lang = "en";
      game.data.files = {
        storages: ["data", "public", "s3"],
        s3: { buckets: ["bucket-a", "bucket-b"] }
      };
      globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["file"], { type: "text/plain" }) });
    },
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}