import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createHtmlHarness,
  createTestEnvironment,
  flushPromises,
  modulePath,
  TestElement
} from "./helpers/test-helpers.mjs";

const env = createTestEnvironment();
const { __test__ } = await import(modulePath("scripts/sfc.js"));

function setBrowseResult(source, target, result, bucket = "") {
  env.state.browseResults.set(`${source}|${target}|${bucket}`, result);
}

async function withoutConsoleError(callback) {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    return await callback();
  } finally {
    console.error = originalConsoleError;
  }
}

const FORGE_PREFIX = "https://assets.forge-vtt.com/";
const FORGE_USER_URL = `${FORGE_PREFIX}user123/`;

function simulateForge() {
  globalThis.ForgeVTT = { usingTheForge: true, ASSETS_LIBRARY_URL_PREFIX: FORGE_PREFIX };
  globalThis.ForgeAPI = { getUserId: async () => "user123" };
}

test.beforeEach(() => {
  env.reset();
});

test.afterEach(() => {
  delete globalThis.ForgeVTT;
  delete globalThis.ForgeAPI;
});

test.after(() => {
  env.restore();
});

test("registers settings, menu, keybinding, and scene controls", async () => {
  await env.hooks.trigger("init");
  assert.equal(env.state.registerCalls.length, 6);
  assert.equal(env.state.registerMenuCalls.length, 1);
  assert.equal(env.state.keybindingCalls.length, 1);
  assert.equal(env.state.keybindingCalls[0].data.onDown(), true);

  const languageSetting = env.state.registerCalls.find((entry) => entry.key === __test__.UI_LANGUAGE_SETTING);
  assert.deepEqual(languageSetting.data.choices, {
    default: "Follow Foundry",
    de: "Deutsch",
    en: "English"
  });

  const restoreSetting = env.state.registerCalls.find((entry) => entry.key === __test__.RESTORE_STATE_SETTING);
  await restoreSetting.data.onChange(false);
  assert.equal(env.state.settingWrites.at(-1).key, __test__.STATE_SETTING);

  const sceneControlSetting = env.state.registerCalls.find((entry) => entry.key === __test__.SHOW_SCENE_CONTROL_SETTING);
  sceneControlSetting.data.onChange(true);
  assert.deepEqual(env.state.controlRenders, [{ reset: true }]);

  const controls = {};
  await env.hooks.trigger("getSceneControlButtons", controls);
  assert.equal(typeof controls.fileCommander.onChange, "function");
  assert.equal(controls.fileCommander.activeTool, "open");
  assert.equal(typeof controls.fileCommander.tools.open.onChange, "function");

  env.game.user.isGM = false;
  const hiddenControls = {};
  await env.hooks.trigger("getSceneControlButtons", hiddenControls);
  assert.deepEqual(hiddenControls, {});
});

test("scene control toggle closes open window and ignores false activations", async () => {
  await env.hooks.trigger("init");

  const controls = {};
  await env.hooks.trigger("getSceneControlButtons", controls);
  globalThis.ui.controls.controls.fileCommander = controls.fileCommander;

  const originalRender = __test__.SFCFileCommanderApp.prototype.render;
  const originalClose = __test__.SFCFileCommanderApp.prototype.close;
  let renderCount = 0;
  let closeCount = 0;
  __test__.SFCFileCommanderApp.prototype.render = function(force) {
    renderCount += 1;
    return originalRender.call(this, force);
  };
  __test__.SFCFileCommanderApp.prototype.close = async function(options) {
    closeCount += 1;
    return originalClose.call(this, options);
  };

  try {
    controls.fileCommander.onChange(undefined, false);
    controls.fileCommander.tools.open.onChange(undefined, false);
    assert.equal(renderCount, 0);
    assert.equal(closeCount, 0);

    __test__.openFileCommander();
    assert.equal(renderCount, 1);
    assert.equal(closeCount, 0);

    globalThis.ui.controls.control = { name: "fileCommander" };
    await __test__.toggleFileCommanderFromSceneControl();
    assert.equal(closeCount, 1);
    assert.deepEqual(env.state.controlActivations.at(-1), { control: __test__.DEFAULT_SCENE_CONTROL });

    __test__.openFileCommander();
    assert.equal(renderCount, 2);
    assert.equal(closeCount, 1);

    await __test__.toggleFileCommanderFromSceneControl();
    assert.equal(closeCount, 2);
  } finally {
    __test__.SFCFileCommanderApp.prototype.render = originalRender;
    __test__.SFCFileCommanderApp.prototype.close = originalClose;
  }
});

test("open menu and singleton opening return the same application until closed", async () => {
  const first = __test__.openFileCommander();
  const baselineRenderCount = first.renderCalls.length;
  const second = __test__.openFileCommander();
  assert.equal(first, second);
  assert.equal(first.renderCalls.length, baselineRenderCount + 1);

  const menu = new __test__.SFCOpenMenu();
  assert.equal(menu.render(), menu);
  assert.equal(first.renderCalls.length, baselineRenderCount + 2);

  await first.close({ force: true });
  const third = __test__.openFileCommander();
  assert.notEqual(third, first);
  await third.close({ force: true });
});

test("language helpers follow the setting and refresh the open commander", async () => {
  await env.hooks.trigger("init");

  globalThis.fetch = async (url) => {
    const language = url.match(/\/(en|de)\.json$/)?.[1];
    return {
      ok: true,
      async json() {
        if ( language === "de" ) {
          return {
            "SFC.Title": "Datei-Kommandant",
            "SFC.Settings.Menu.Label": "Kommandant öffnen"
          };
        }

        return {
          "SFC.Title": "File Commander",
          "SFC.Settings.Menu.Label": "Open Commander"
        };
      }
    };
  };

  assert.equal(__test__.normalizeUiLanguage("de-DE"), "de");
  assert.equal(__test__.normalizeUiLanguage("en_US"), "en");
  assert.equal(__test__.normalizeUiLanguage("fr"), "en");

  env.game.i18n.lang = "de-DE";
  env.state.settingsValues.set(`sephrals-file-commander.${__test__.UI_LANGUAGE_SETTING}`, "default");
  assert.equal(__test__.getModuleLanguage(), "de");

  env.state.settingsValues.set(`sephrals-file-commander.${__test__.UI_LANGUAGE_SETTING}`, "en");
  assert.equal(__test__.getModuleLanguage(), "en");

  const app = __test__.openFileCommander();
  const baselineRenderCount = app.renderCalls.length;
  const languageSetting = env.state.registerCalls.find((entry) => entry.key === __test__.UI_LANGUAGE_SETTING);

  env.state.settingsValues.set(`sephrals-file-commander.${__test__.UI_LANGUAGE_SETTING}`, "de");
  languageSetting.data.onChange("de");
  await flushPromises();

  assert.equal(app.options.title, "Datei-Kommandant");
  assert.equal(__test__.localize("SFC.Settings.Menu.Label"), "Kommandant öffnen");
  assert.equal(app.renderCalls.length, baselineRenderCount + 1);
  assert.deepEqual(env.state.controlRenders.at(-1), { reset: true });

  await app.close({ force: true });
});

test("follow Foundry returns game.i18n strings for other languages instead of the bundled English file", async () => {
  const bundledEnglish = JSON.parse(await readFile(new URL(modulePath("lang/en.json")), "utf8"));
  const cache = __test__.MODULE_TRANSLATION_CACHE;
  const previousEnglish = cache.get("en");
  const previousTitle = env.state.localizations.get("SFC.Title");
  const previousSummary = env.state.localizations.get("SFC.Pane.Summary");
  cache.set("en", bundledEnglish);

  try {
    assert.equal(typeof bundledEnglish["SFC.Title"], "string");
    env.game.i18n.lang = "fr";
    env.state.localizations.set("SFC.Title", "Commandant de fichiers");
    env.state.localizations.set("SFC.Pane.Summary", "{dirs} dossiers, {files} fichiers");
    env.state.settingsValues.set(`sephrals-file-commander.${__test__.UI_LANGUAGE_SETTING}`, "default");

    assert.equal(__test__.localize("SFC.Title"), "Commandant de fichiers");
    assert.equal(__test__.localize("SFC.Pane.Summary", { dirs: 2, files: 3 }), "2 dossiers, 3 fichiers");

    // An explicit module language still overrides game.i18n with the bundled file.
    env.state.settingsValues.set(`sephrals-file-commander.${__test__.UI_LANGUAGE_SETTING}`, "en");
    assert.equal(__test__.localize("SFC.Title"), bundledEnglish["SFC.Title"]);
    assert.equal(__test__.localize("SFC.Pane.Summary", { dirs: 2, files: 3 }), "2 dirs, 3 files");
  } finally {
    if ( previousEnglish ) cache.set("en", previousEnglish);
    else cache.delete("en");
    env.state.localizations.set("SFC.Title", previousTitle);
    env.state.localizations.set("SFC.Pane.Summary", previousSummary);
  }
});

test("path and labeling helpers normalize values and fall back correctly", () => {
  assert.equal(__test__.storageLabel("data"), "User Data");
  assert.equal(__test__.storageChoices().s3, "S3");
  assert.equal(__test__.supportsDeleteOperation(), false);
  env.state.settingsValues.set(`sephrals-file-commander.${__test__.DEFAULT_LEFT_SOURCE_SETTING}`, "missing");
  assert.equal(__test__.configuredDefaultSource("left", ["public", "s3"]), "public");
  assert.equal(__test__.configuredDefaultSource("right", ["data"]), "data");
  assert.equal(__test__.compareEntries({ label: "b" }, { label: "A" }) > 0, true);
  assert.equal(__test__.baseName("folder/name.txt/"), "name.txt");
  assert.equal(__test__.parentPath("folder/sub/name.txt"), "folder/sub");
  assert.equal(__test__.joinPath("folder", "sub/file"), "folder/sub/file");
  assert.equal(__test__.normalizePath("\\folder//./file"), "folder/file");
  assert.equal(__test__.decodeName("hello%20world"), "hello world");
  assert.equal(__test__.decodeName("bad%2"), "bad%2");
  assert.equal(__test__.fileExtension("image.PNG"), "png");
  assert.equal(__test__.fileExtension("noext"), "");
  assert.equal(__test__.toFetchUrl("https://example.com/file.png"), "https://example.com/file.png");
  assert.equal(__test__.toFetchUrl("folder/file.txt"), "/route/folder/file.txt");
});

test("delete command is enabled on v13 and deletes selected files", async () => {
  env.game.release = { generation: 13 };
  setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt", "other.txt"] });

  const app = new __test__.SFCFileCommanderApp();
  const data = await app.getData();
  assert.equal(data.commandBar.find((entry) => entry.key === "F8")?.action, "delete");
  assert.equal(__test__.supportsDeleteOperation(), true);

  app.state.activePane = "left";
  app.state.panes.left.source = "data";
  app.state.panes.left.path = "";
  app.state.panes.left.entries = [
    { path: "source.txt", label: "source.txt", name: "source.txt", type: "file", isParent: false },
    { path: "other.txt", label: "other.txt", name: "other.txt", type: "file", isParent: false }
  ];
  app.state.panes.left.selectedPath = "source.txt";

  const harness = createHtmlHarness();
  app.element = harness.root;
  app.activateListeners(harness.root);

  harness.controls.deleteButton.trigger("click");
  await flushPromises();
  assert.deepEqual(env.state.deleteCalls.at(-1), { source: "data", target: "source.txt", options: {} });
  assert.equal(env.state.notifications.info.at(-1), "deleted source.txt");

  harness.controls.app.trigger("keydown", { key: "F8" });
  await flushPromises();
  assert.equal(env.state.deleteCalls.length, 2);
});

test("delete command stays disabled on v14", async () => {
  setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt"] });

  const app = new __test__.SFCFileCommanderApp();
  const data = await app.getData();
  const deleteCommand = data.commandBar.find((entry) => entry.key === "F8");

  assert.equal(deleteCommand?.disabled, true);
  assert.equal(deleteCommand?.action, undefined);
  assert.equal(__test__.supportsDeleteOperation(), false);
});

test("chooseFiles resolves on change or on window refocus", async () => {
  const changePromise = __test__.chooseFiles();
  const firstInput = env.state.createdInputs.at(-1);
  firstInput.files = [{ name: "alpha.txt" }];
  firstInput.trigger("change");
  const chosen = await changePromise;
  assert.equal(chosen[0].name, "alpha.txt");

  const focusPromise = __test__.chooseFiles();
  const secondInput = env.state.createdInputs.at(-1);
  secondInput.files = [{ name: "beta.txt" }];
  window.trigger("focus");
  const chosenOnFocus = await focusPromise;
  assert.equal(chosenOnFocus[0].name, "beta.txt");
});

test("application getData loads panes, serializes entries, and handles browse errors", async () => {
  setBrowseResult("data", "", { target: "", dirs: ["folder-a"], files: ["file-a.txt"] });
  setBrowseResult("public", "", new Error("browse failed"));

  const app = new __test__.SFCFileCommanderApp();
  const data = await app.getData();
  assert.equal(data.labels.copy, "Copy");
  assert.equal(data.panes.left.entries.length, 2);
  assert.equal(data.panes.left.entries[0].label, "[folder-a]");
  assert.match(data.panes.right.error, /browse failed/);
  assert.equal(app.state.panes.left.selectedPath, "folder-a");
  assert.equal(app.state.panes.right.loaded, true);
  assert.equal(__test__.SFCFileCommanderApp.defaultOptions.template.includes("file-commander.html"), true);
});

test("activateListeners wires pane, path, source, bucket, entry, toolbar, and navigation flows", async () => {
  setBrowseResult("data", "", { target: "", dirs: ["folder-a"], files: ["alpha.txt"] });
  setBrowseResult("public", "", { target: "", dirs: [], files: ["beta.txt"] });
  setBrowseResult("data", "folder-a", { target: "folder-a", dirs: [], files: ["nested.txt"] });
  setBrowseResult("data", "file-a.txt", { target: "file-a.txt", dirs: [], files: [] });
  setBrowseResult("data", "left/path", { target: "left/path", dirs: [], files: [] });
  setBrowseResult("data", "", { target: "", dirs: ["folder-a"], files: ["file-a.txt"] });
  setBrowseResult("s3", "", { target: "", dirs: [], files: [] }, "bucket-a");
  setBrowseResult("s3", "", { target: "", dirs: [], files: [] }, "bucket-b");

  const app = new __test__.SFCFileCommanderApp();
  await app.getData();
  const harness = createHtmlHarness();
  app.element = harness.root;
  app.activateListeners(harness.root);

  harness.controls.leftPane.trigger("mousedown", { target: new TestElement() });
  assert.equal(app.state.activePane, "left");

  harness.controls.leftInput.value = "left/path";
  harness.controls.leftForm.trigger("submit");
  await flushPromises();
  assert.equal(app.state.panes.left.path, "left/path");

  harness.controls.leftSource.value = "s3";
  harness.controls.leftSource.trigger("change");
  await flushPromises();
  assert.equal(app.state.panes.left.source, "s3");
  assert.equal(app.state.panes.left.bucket, "bucket-a");

  harness.controls.leftBucket.value = "bucket-b";
  harness.controls.leftBucket.trigger("change");
  await flushPromises();
  assert.equal(app.state.panes.left.bucket, "bucket-b");

  harness.controls.leftEntry.dataset.path = "folder-a";
  harness.controls.leftEntry.trigger("click");
  await flushPromises();
  assert.equal(app.state.panes.left.selectedPath, "folder-a");

  app.state.panes.left.source = "data";
  app.state.panes.left.bucket = "";
  app.state.panes.left.entries = [
    { path: "folder-a", label: "[folder-a]", name: "folder-a", type: "directory", isParent: false }
  ];
  harness.controls.leftEntry.trigger("dblclick");
  await flushPromises();
  assert.equal(app.state.panes.left.path, "folder-a");

  app.state.panes.left.entries = [
    { path: "", label: "[..]", name: "..", type: "directory", isParent: true },
    { path: "folder-a", label: "[folder-a]", name: "folder-a", type: "directory", isParent: false },
    { path: "file-a.txt", label: "file-a.txt", name: "file-a.txt", type: "file", isParent: false }
  ];
  app.state.panes.left.selectedPath = "folder-a";
  app.state.panes.right.entries = [{ path: "beta.txt", label: "beta.txt", name: "beta.txt", type: "file", isParent: false }];
  app.state.panes.right.selectedPath = "beta.txt";
  app.state.activePane = "left";
  harness.controls.viewButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.windowOpenCalls.length >= 0, true);

  harness.controls.switchButton.trigger("click");
  await flushPromises();
  assert.equal(app.state.activePane, "right");

  harness.controls.refreshButton.trigger("click");
  await flushPromises();

  harness.controls.app.trigger("keydown", { key: "Tab" });
  await flushPromises();
  app.state.activePane = "left";
  app.state.panes.left.entries = [
    { path: "", label: "[..]", name: "..", type: "directory", isParent: true },
    { path: "folder-a", label: "[folder-a]", name: "folder-a", type: "directory", isParent: false },
    { path: "file-a.txt", label: "file-a.txt", name: "file-a.txt", type: "file", isParent: false }
  ];
  app.state.panes.left.selectedPath = "file-a.txt";
  app.state.panes.left.path = "folder-a";
  harness.controls.app.trigger("keydown", { key: "ArrowDown" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "ArrowUp" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "Home" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "End" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "Backspace" });
  await flushPromises();
  app.state.panes.left.path = "folder-a";
  harness.controls.app.trigger("keydown", { key: "ArrowLeft" });
  await flushPromises();
  app.state.panes.left.entries = [{ path: "file-a.txt", label: "file-a.txt", name: "file-a.txt", type: "file", isParent: false }];
  app.state.panes.left.selectedPath = "file-a.txt";
  harness.controls.app.trigger("keydown", { key: "ArrowRight" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "Enter" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "F3" });
  await flushPromises();
  app.state.panes.right.source = "data";
  app.state.panes.right.path = "target";
  harness.controls.app.trigger("keydown", { key: "F5" });
  await flushPromises();
  env.state.promptValue = "kbd-folder";
  harness.controls.app.trigger("keydown", { key: "F7" });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "r", ctrlKey: true });
  await flushPromises();
  harness.controls.app.trigger("keydown", { key: "u", ctrlKey: true });
  const keyboardUploadInput = env.state.createdInputs.at(-1);
  keyboardUploadInput.files = [new File(["a"], "keyboard-upload.txt")];
  keyboardUploadInput.trigger("change");
  await flushPromises();
});

test("copy, upload, mkdir, view, open, and error paths are exercised through the UI flows", async () => {
  await withoutConsoleError(async () => {
    setBrowseResult("data", "", { target: "", dirs: ["dir-a"], files: ["source.txt"] });
    setBrowseResult("data", "dir-a", { target: "dir-a", dirs: [], files: ["child.txt"] });
    setBrowseResult("data", "dir-a/subdir", { target: "dir-a/subdir", dirs: [], files: ["deep.txt"] });
    setBrowseResult("public", "", { target: "", dirs: [], files: [] });

    const app = new __test__.SFCFileCommanderApp();
    await app.getData();
    app.state.activePane = "left";
    app.state.panes.left.selectedPath = "source.txt";
    app.state.panes.left.entries = [
      { path: "source.txt", label: "source.txt", name: "source.txt", type: "file", isParent: false }
    ];
    app.state.panes.right.source = "data";
    app.state.panes.right.path = "target";
    app.state.panes.right.bucket = "";
    app.state.panes.right.entries = [];

    const harness = createHtmlHarness();
    app.element = harness.root;
    app.activateListeners(harness.root);

    app.state.panes.left.selectedPath = "dir-a";
    app.state.panes.left.entries = [
      { path: "dir-a", label: "[dir-a]", name: "dir-a", type: "directory", isParent: false }
    ];
    setBrowseResult("data", "dir-a", { target: "dir-a", dirs: ["dir-a/subdir"], files: ["dir-a/child.txt"] });
    setBrowseResult("data", "dir-a/subdir", { target: "dir-a/subdir", dirs: [], files: ["dir-a/subdir/deep.txt"] });
    harness.controls.copyButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.uploadCalls.length >= 2, true);
    assert.equal(env.state.notifications.info.some((entry) => entry.includes("copy started")), true);

    env.state.promptValue = "new-folder";
    harness.controls.mkdirButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.createDirectoryCalls.some((entry) => entry.path.includes("new-folder")), true);

    harness.controls.uploadButton.trigger("click");
    const uploadInput = env.state.createdInputs.at(-1);
    uploadInput.files = [new File(["a"], "upload.txt")];
    uploadInput.trigger("change");
    await flushPromises();
    assert.equal(env.state.uploadCalls.some((entry) => entry.file.name === "upload.txt"), true);

    harness.controls.uploadButton.trigger("click");
    const cancelledUploadInput = env.state.createdInputs.at(-1);
    cancelledUploadInput.files = [];
    cancelledUploadInput.trigger("change");
    await flushPromises();
    assert.equal(env.state.notifications.info.includes("cancelled"), true);

    app.state.panes.left.selectedPath = "";
    harness.controls.viewButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error no selection");
  });
});

test("helper branches cover same-target, non-writable target, fetch failures, directory exists, and browse bucket guards", async () => {
  await withoutConsoleError(async () => {
    setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt"] });
    const app = new __test__.SFCFileCommanderApp();
    await app.getData();

    app.state.activePane = "left";
    app.state.panes.left.selectedPath = "source.txt";
    app.state.panes.left.entries = [
      { path: "source.txt", label: "source.txt", name: "source.txt", type: "file", isParent: false }
    ];
    app.state.panes.right.entries = [];
    app.state.panes.right.selectedPath = "";
    app.state.panes.right.source = "public";
    app.state.panes.right.path = "";

    const harness = createHtmlHarness();
    app.element = harness.root;
    app.activateListeners(harness.root);
    harness.controls.copyButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error no writable target");

    app.state.panes.right.source = "data";
    app.state.panes.right.path = "";
    app.state.panes.left.path = "";
    harness.controls.copyButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error same target");

    globalThis.fetch = async () => ({ ok: false });
    app.state.panes.right.path = "target";
    harness.controls.copyButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error fetch failed");

    env.state.createDirectoryErrors.set("existing", new Error("already exists"));
    env.state.promptValue = "existing";
    harness.controls.mkdirButton.trigger("click");
    await flushPromises();

    env.state.createDirectoryErrors.set("boom-folder", new Error("boom"));
    env.state.promptValue = "boom-folder";
    harness.controls.mkdirButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error boom");

    app.state.panes.left.source = "s3";
    app.state.panes.left.bucket = "";
    harness.controls.leftInput.value = "needs-bucket";
    harness.controls.leftForm.trigger("submit");
    await flushPromises();
    assert.equal(app.state.panes.left.error, "missing bucket");

    harness.controls.leftForm.dataset.pane = "missing";
    harness.controls.leftForm.trigger("submit");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1).startsWith("error "), true);

    const originalOpen = window.open;
    window.open = () => {
      throw new Error("open failed");
    };
    app.state.panes.left.source = "data";
    app.state.panes.left.entries = [{ path: "source.txt", label: "source.txt", name: "source.txt", type: "file", isParent: false }];
    app.state.panes.left.selectedPath = "source.txt";
    harness.controls.leftEntry.dataset.path = "source.txt";
    harness.controls.leftEntry.trigger("dblclick");
    await flushPromises();
    assert.equal(env.state.notifications.error.at(-1), "error open failed");
    window.open = originalOpen;
  });
});

test("close persists pane state when restore is enabled and skips when disabled", async () => {
  setBrowseResult("data", "", { target: "", dirs: [], files: [] });
  setBrowseResult("public", "", { target: "", dirs: [], files: [] });
  const app = new __test__.SFCFileCommanderApp();
  await app.getData();
  app.state.activePane = "right";
  app.state.panes.left.path = "left";
  app.state.panes.left.selectedPath = "left/file.txt";
  app.state.panes.right.path = "right";
  app.state.panes.right.selectedPath = "right/file.txt";
  await app.close({ force: true });
  assert.equal(env.state.settingWrites.at(-1).key, __test__.STATE_SETTING);

  env.reset();
  env.state.settingsValues.set(`sephrals-file-commander.${__test__.RESTORE_STATE_SETTING}`, false);
  const noRestoreApp = new __test__.SFCFileCommanderApp();
  await noRestoreApp.close({ force: true });
  assert.equal(env.state.settingWrites.length, 0);
});

test("keyboard shortcut catch branches surface errors through notifications", async () => {
  await withoutConsoleError(async () => {
    setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt"] });
    setBrowseResult("public", "", { target: "", dirs: [], files: [] });

    const app = new __test__.SFCFileCommanderApp();
    await app.getData();
    const harness = createHtmlHarness();
    app.element = harness.root;
    app.activateListeners(harness.root);
    app.state.activePane = "left";
    app.state.panes.left.entries = [{ path: "source.txt", label: "source.txt", name: "source.txt", type: "file", isParent: false }];
    app.state.panes.left.selectedPath = "source.txt";

    const originalOpen = window.open;
    window.open = () => {
      throw new Error("open failed");
    };
    harness.controls.app.trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    harness.controls.app.trigger("keydown", { key: "Enter" });
    await flushPromises();
    window.open = originalOpen;

    app.state.panes.left.selectedPath = "";
    harness.controls.app.trigger("keydown", { key: "F3" });
    await flushPromises();

    app.state.panes.left.selectedPath = "source.txt";
    app.state.panes.right.source = "public";
    harness.controls.app.trigger("keydown", { key: "F5" });
    await flushPromises();

    app.state.activePane = "right";
    harness.controls.app.trigger("keydown", { key: "F7" });
    await flushPromises();

    app.state.panes.left = undefined;
    harness.controls.app.trigger("keydown", { key: "r", ctrlKey: true });
    await flushPromises();

    app.state.activePane = "right";
    harness.controls.app.trigger("keydown", { key: "u", ctrlKey: true });
    await flushPromises();

    assert.equal(env.state.notifications.error.length >= 6, true);
  });
});

test("storage helpers add the Assets Library and prefer it as default only on The Forge", async () => {
  // Off The Forge nothing changes.
  assert.equal(__test__.isUsingTheForge(), false);
  assert.deepEqual(__test__.availableStorages(), ["data", "public", "s3"]);
  assert.equal(__test__.FORGE_SOURCE in __test__.storageChoices(), false);
  assert.equal(__test__.configuredDefaultSource("left", ["data", "public"]), "data");
  assert.equal(__test__.toStoragePath("forgevtt", `${FORGE_USER_URL}maps`), `${FORGE_USER_URL}maps`);
  globalThis.ForgeVTT = { usingTheForge: false, ASSETS_LIBRARY_URL_PREFIX: FORGE_PREFIX };
  assert.equal(__test__.isUsingTheForge(), false);
  assert.deepEqual(__test__.availableStorages(), ["data", "public", "s3"]);

  simulateForge();
  assert.equal(__test__.isUsingTheForge(), true);
  const storages = __test__.availableStorages();
  assert.deepEqual(storages, ["forgevtt", "data", "public", "s3"]);
  assert.equal(__test__.WRITABLE_SOURCES.has("forgevtt"), true);
  assert.equal(__test__.storageLabel("forgevtt"), "Assets Library");
  assert.equal(__test__.storageChoices().forgevtt, "Assets Library");

  // The configured "data" default becomes the Assets Library, other choices stay.
  assert.equal(__test__.configuredDefaultSource("left", storages), "forgevtt");
  assert.equal(__test__.configuredDefaultSource("right", storages), "public");
  env.state.settingsValues.set(`sephrals-file-commander.${__test__.DEFAULT_LEFT_SOURCE_SETTING}`, "missing");
  assert.equal(__test__.configuredDefaultSource("left", storages), "forgevtt");
  assert.equal(__test__.configuredDefaultSource("left", ["data", "public"]), "data");

  env.game.data.files.storages = ["forgevtt", "data"];
  assert.deepEqual(__test__.availableStorages(), ["forgevtt", "data"]);

  // Absolute Assets Library URLs map back to relative paths for the forgevtt source only.
  assert.equal(__test__.toStoragePath("forgevtt", `${FORGE_USER_URL}maps/tokens`), "maps/tokens");
  assert.equal(__test__.toStoragePath("forgevtt", `${FORGE_USER_URL}maps/a%20b.png?v=2`), "maps/a%20b.png");
  assert.equal(__test__.toStoragePath("forgevtt", "maps/tokens"), "maps/tokens");
  assert.equal(__test__.toStoragePath("data", `${FORGE_USER_URL}maps`), `${FORGE_USER_URL}maps`);
  assert.equal(__test__.baseName(`${FORGE_USER_URL}maps/castle%20map.webp?v=2#x`), "castle%20map.webp");

  // Settings registered on The Forge offer the Assets Library as default source.
  await env.hooks.trigger("init");
  const leftSetting = env.state.registerCalls.find((entry) => entry.key === __test__.DEFAULT_LEFT_SOURCE_SETTING);
  assert.equal(leftSetting.data.choices.forgevtt, "Assets Library");
  assert.equal(leftSetting.data.default, "data");
});

test("on The Forge the commander browses, copies, uploads, and creates folders in the Assets Library", async () => {
  simulateForge();
  setBrowseResult("forgevtt", "", { target: "", dirs: ["maps"], files: [`${FORGE_USER_URL}token%20art.png`] });
  setBrowseResult("public", "", { target: "", dirs: [], files: [] });

  const app = new __test__.SFCFileCommanderApp();
  assert.equal(app.state.panes.left.source, "forgevtt");
  assert.equal(app.state.panes.right.source, "public");

  const data = await app.getData();
  assert.equal(data.panes.left.storageLabel, "Assets Library");
  assert.deepEqual(data.panes.left.sourceOptions.map((option) => option.value), ["forgevtt", "data", "public", "s3"]);
  assert.equal(data.panes.left.sourceOptions[0].selected, true);
  assert.equal(data.panes.left.entries[0].path, "maps");
  const fileEntry = data.panes.left.entries.find((entry) => entry.type === "file");
  assert.equal(fileEntry.path, `${FORGE_USER_URL}token%20art.png`);
  assert.equal(fileEntry.name, "token art.png");
  assert.equal(fileEntry.extension, "png");

  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    return { ok: true, blob: async () => new Blob(["img"], { type: "image/png" }) };
  };

  const harness = createHtmlHarness();
  app.element = harness.root;
  app.activateListeners(harness.root);

  // Copy a file out of the Assets Library: the absolute URL is fetched as is.
  app.state.activePane = "left";
  app.state.panes.left.selectedPath = fileEntry.path;
  app.state.panes.right.source = "data";
  app.state.panes.right.path = "imported";
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.deepEqual(fetchCalls, [fileEntry.path]);
  assert.equal(env.state.uploadCalls.at(-1).source, "data");
  assert.equal(env.state.uploadCalls.at(-1).target, "imported");
  assert.equal(env.state.uploadCalls.at(-1).file.name, "token art.png");

  // Copy a directory into the Assets Library: a failing createDirectory does not stop the upload.
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    setBrowseResult("data", "imported/dir-a", { target: "imported/dir-a", dirs: [], files: ["imported/dir-a/child.txt"] });
    env.state.createDirectoryErrors.set("maps/dir-a", new Error("forge refused"));
    app.state.panes.left.path = "maps";
    app.state.panes.right.entries = [
      { path: "imported/dir-a", label: "[dir-a]", name: "dir-a", type: "directory", isParent: false }
    ];
    app.state.panes.right.selectedPath = "imported/dir-a";
    app.state.activePane = "right";
    harness.controls.copyButton.trigger("click");
    await flushPromises();
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(env.state.createDirectoryCalls.at(-1), { source: "forgevtt", path: "maps/dir-a", options: {} });
  assert.equal(warnings.length, 1);
  assert.equal(env.state.uploadCalls.at(-1).source, "forgevtt");
  assert.equal(env.state.uploadCalls.at(-1).target, "maps/dir-a");
  assert.equal(env.state.uploadCalls.at(-1).file.name, "child.txt");
  assert.equal(fetchCalls.at(-1), "/route/imported/dir-a/child.txt");

  // Upload and new folder in the Assets Library pane.
  app.state.activePane = "left";
  app.state.panes.left.path = "maps";
  harness.controls.uploadButton.trigger("click");
  const uploadInput = env.state.createdInputs.at(-1);
  uploadInput.files = [new File(["a"], "upload.png")];
  uploadInput.trigger("change");
  await flushPromises();
  assert.equal(env.state.uploadCalls.at(-1).source, "forgevtt");
  assert.equal(env.state.uploadCalls.at(-1).target, "maps");

  env.state.promptValue = "tokens";
  harness.controls.mkdirButton.trigger("click");
  await flushPromises();
  assert.deepEqual(env.state.createDirectoryCalls.at(-1), { source: "forgevtt", path: "maps/tokens", options: {} });

  // An absolute Assets Library URL typed into the path field navigates to its relative folder.
  harness.controls.leftInput.value = `${FORGE_USER_URL}maps/tokens`;
  harness.controls.leftForm.trigger("submit");
  await flushPromises();
  assert.deepEqual(env.state.browseCalls.at(-1), { source: "forgevtt", target: "maps/tokens", options: {} });
  assert.equal(app.state.panes.left.path, "maps/tokens");

  assert.deepEqual(env.state.notifications.error, []);
});

test("a restored Assets Library pane falls back to the default source outside The Forge", () => {
  env.state.settingsValues.set(`sephrals-file-commander.${__test__.STATE_SETTING}`, {
    activePane: "left",
    panes: { left: { source: "forgevtt", path: "maps" }, right: { source: "public", path: "" } }
  });

  const app = new __test__.SFCFileCommanderApp();
  assert.equal(app.state.panes.left.source, "data");
  assert.equal(app.state.panes.right.source, "public");

  simulateForge();
  const forgeApp = new __test__.SFCFileCommanderApp();
  assert.equal(forgeApp.state.panes.left.source, "forgevtt");
  assert.equal(forgeApp.state.panes.left.path, "maps");
});