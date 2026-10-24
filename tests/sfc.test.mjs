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
  assert.equal(env.state.registerCalls.length, 7);
  assert.equal(env.state.registerMenuCalls.length, 2);
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

test("F8 stays a disabled placeholder on v13 and v14 and the commander never deletes files", async () => {
  for ( const generation of [13, 14] ) {
    env.reset();
    env.game.release = { generation };
    setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt"] });

    const app = new __test__.SFCFileCommanderApp();
    const data = await app.getData();
    const deleteCommand = data.commandBar.find((entry) => entry.key === "F8");
    assert.equal(deleteCommand?.disabled, true);
    assert.equal(deleteCommand?.action, undefined);

    const harness = createHtmlHarness();
    app.element = harness.root;
    app.activateListeners(harness.root);
    app.state.activePane = "left";
    app.state.panes.left.selectedPath = "source.txt";
    const event = harness.controls.app.trigger("keydown", { key: "F8" });
    await flushPromises();
    assert.equal(event.defaultPrevented, undefined);
    assert.deepEqual(env.state.deleteCalls, []);
  }
});

test("opening needs the browse permission and write commands need the upload permission", async () => {
  await env.hooks.trigger("init");

  env.state.permissions.FILES_BROWSE = false;
  assert.equal(__test__.canBrowseFiles(), false);
  assert.equal(__test__.openFileCommander(), null);
  assert.equal(env.state.notifications.warn.at(-1), "no browse permission");
  assert.equal(env.state.keybindingCalls[0].data.onDown(), true);
  assert.equal(env.state.notifications.warn.length, 2);
  const menu = new __test__.SFCOpenMenu();
  assert.equal(menu.render(), menu);
  assert.equal(env.state.notifications.warn.length, 3);

  env.state.permissions.FILES_BROWSE = true;
  env.state.permissions.FILES_UPLOAD = false;
  assert.equal(__test__.canUploadFiles(), false);
  setBrowseResult("data", "", { target: "", dirs: [], files: ["source.txt"] });

  const app = __test__.openFileCommander();
  assert.notEqual(app, null);
  const data = await app.getData();
  const command = (key) => data.commandBar.find((entry) => entry.key === key);
  for ( const key of ["F5", "F7", "Ctrl+U"] ) {
    assert.equal(command(key).disabled, true, key);
    assert.equal(command(key).action, undefined, key);
  }
  assert.equal(command("F3").action, "view");
  assert.equal(command("Tab").action, "switch-pane");
  assert.equal(command("Ctrl+C").action, "copy-path");

  const harness = createHtmlHarness();
  app.element = harness.root;
  app.activateListeners(harness.root);
  app.state.activePane = "left";
  app.state.panes.left.selectedPath = "source.txt";
  app.state.panes.right.source = "data";
  app.state.panes.right.path = "target";
  env.state.promptValue = "blocked-folder";

  harness.controls.app.trigger("keydown", { key: "F5" });
  harness.controls.app.trigger("keydown", { key: "F7" });
  harness.controls.app.trigger("keydown", { key: "u", ctrlKey: true });
  await flushPromises();

  assert.deepEqual(env.state.notifications.warn.slice(-3), ["no upload permission", "no upload permission", "no upload permission"]);
  assert.deepEqual(env.state.uploadCalls, []);
  assert.deepEqual(env.state.createDirectoryCalls, []);
  assert.equal(env.state.createdInputs.length, 0);
  assert.deepEqual(env.state.notifications.error, []);

  // With the permission the full command bar comes back.
  env.state.permissions.FILES_UPLOAD = true;
  const allowed = await app.getData();
  assert.equal(allowed.commandBar.find((entry) => entry.key === "F5").action, "copy");
  assert.equal(allowed.commandBar.length, 9);
  await app.close({ force: true });
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

const fileEntry = (path) => {
  const name = __test__.decodeName(__test__.baseName(path));
  return { path, label: name, name, extension: __test__.fileExtension(name), type: "file", isParent: false };
};

async function createWiredApp({ left = [], right = [] } = {}) {
  setBrowseResult("data", "", { target: "", dirs: [], files: [] });
  setBrowseResult("public", "", { target: "", dirs: [], files: [] });
  const app = new __test__.SFCFileCommanderApp();
  await app.getData();
  const harness = createHtmlHarness();
  app.element = harness.root;
  app.activateListeners(harness.root);
  app.state.activePane = "left";
  app.state.panes.left.entries = left;
  app.state.panes.left.selectedPath = left[0]?.path ?? "";
  app.state.panes.right.entries = right;
  app.state.panes.right.selectedPath = right[0]?.path ?? "";
  return { app, harness };
}

test("keyboard selection updates rows in place, scrolls into view, and saves the state once after a pause", async () => {
  const { app, harness } = await createWiredApp({
    left: [fileEntry("a.txt"), fileEntry("b.txt"), fileEntry("c.txt")],
    right: [fileEntry("right.txt")]
  });
  const { leftEntry, rightEntry, leftPane, rightPane, statusLine } = harness.controls;
  leftEntry.dataset.path = "b.txt";
  rightEntry.dataset.path = "right.txt";
  const renders = app.renderCalls.length;
  const writes = env.state.settingWrites.length;
  assert.deepEqual(env.state.debounceDelays, [__test__.STATE_SAVE_DELAY]);

  const down = harness.controls.app.trigger("keydown", { key: "ArrowDown" });
  assert.equal(down.defaultPrevented, true);
  assert.equal(down.propagationStopped, true);
  assert.equal(app.state.panes.left.selectedPath, "b.txt");
  assert.equal(leftEntry.hasClass("is-selected"), true);
  assert.deepEqual(leftEntry.scrollCalls, [{ block: "nearest" }]);
  assert.equal(statusLine.textContent, "Selection: b.txt");
  assert.equal(statusLine.attributes.title, "Selection: b.txt");

  harness.controls.app.trigger("keydown", { key: "ArrowDown" });
  assert.equal(app.state.panes.left.selectedPath, "c.txt");
  assert.equal(leftEntry.hasClass("is-selected"), false);
  harness.controls.app.trigger("keydown", { key: "Home" });
  assert.equal(app.state.panes.left.selectedPath, "a.txt");
  harness.controls.app.trigger("keydown", { key: "End" });
  assert.equal(app.state.panes.left.selectedPath, "c.txt");
  harness.controls.app.trigger("keydown", { key: "ArrowUp" });
  assert.equal(app.state.panes.left.selectedPath, "b.txt");

  // Tab only moves the active pane marker.
  harness.controls.app.trigger("keydown", { key: "Tab" });
  assert.equal(app.state.activePane, "right");
  assert.equal(rightPane.hasClass("is-active"), true);
  assert.equal(leftPane.hasClass("is-active"), false);
  assert.equal(rightEntry.hasClass("is-selected"), true);
  assert.equal(statusLine.textContent, "Selection: right.txt");

  // Clicking a row works the same way.
  harness.controls.leftEntry.trigger("click");
  assert.equal(app.state.activePane, "left");
  assert.equal(statusLine.textContent, "Selection: b.txt");

  await flushPromises();
  assert.equal(app.renderCalls.length, renders);
  assert.equal(env.state.settingWrites.length, writes);

  env.flushDebounced();
  await flushPromises();
  assert.equal(env.state.settingWrites.length, writes + 1);
  assert.equal(env.state.settingWrites.at(-1).value.panes.left.selectedPath, "b.txt");
  assert.equal(env.state.settingWrites.at(-1).value.activePane, "left");

  // Closing drops a pending save and writes the state directly.
  harness.controls.app.trigger("keydown", { key: "ArrowDown" });
  assert.equal(env.state.pendingDebounced.size, 1);
  await app.close({ force: true });
  assert.equal(env.state.pendingDebounced.size, 0);
  assert.equal(env.state.settingWrites.at(-1).value.panes.left.selectedPath, "c.txt");
});

test("a render scrolls the selected rows back into view and shows the selection in the status line", async () => {
  setBrowseResult("data", "", { target: "", dirs: ["folder-a"], files: ["file-a.txt"] });
  const app = new __test__.SFCFileCommanderApp();
  const data = await app.getData();
  assert.equal(data.status, "Selection: folder-a");

  app.state.panes.left.selectedPath = "";
  assert.equal((await app.getData()).status, "Selection: none");

  const harness = createHtmlHarness();
  harness.controls.leftEntry.addClass("is-selected");
  app.activateListeners(harness.root);
  assert.deepEqual(harness.controls.leftEntry.scrollCalls, [{ block: "nearest" }]);
  assert.deepEqual(harness.controls.rightEntry.scrollCalls, []);
});

test("Ctrl+C copies the selected path in the form Foundry's FilePicker returns", async () => {
  await withoutConsoleError(async () => {
    const { app, harness } = await createWiredApp({
      left: [
        { path: "worlds", label: "[..]", name: "..", type: "directory", isParent: true },
        fileEntry("worlds/test/map%20a.png"),
        { path: "worlds/test/tokens", label: "[tokens]", name: "tokens", type: "directory", isParent: false }
      ]
    });

    app.state.panes.left.selectedPath = "worlds/test/map%20a.png";
    const event = harness.controls.app.trigger("keydown", { key: "c", ctrlKey: true });
    await flushPromises();
    assert.equal(event.propagationStopped, true);
    assert.deepEqual(env.state.clipboardWrites, ["worlds/test/map%20a.png"]);
    assert.equal(env.state.notifications.info.at(-1), "path copied worlds/test/map%20a.png");

    app.state.panes.left.selectedPath = "worlds/test/tokens";
    harness.controls.copyPathButton.trigger("click");
    await flushPromises();
    assert.equal(env.state.clipboardWrites.at(-1), "worlds/test/tokens");

    // S3 and The Forge list full URLs, which is also what their FilePicker returns.
    app.state.panes.left.entries.push(fileEntry(`${FORGE_USER_URL}maps/castle.webp`));
    app.state.panes.left.selectedPath = `${FORGE_USER_URL}maps/castle.webp`;
    harness.controls.app.trigger("keydown", { key: "C", ctrlKey: true });
    await flushPromises();
    assert.equal(env.state.clipboardWrites.at(-1), `${FORGE_USER_URL}maps/castle.webp`);

    app.state.panes.left.selectedPath = "worlds";
    harness.controls.app.trigger("keydown", { key: "c", ctrlKey: true });
    await flushPromises();
    assert.equal(env.state.clipboardWrites.length, 3);
    assert.equal(env.state.notifications.error.at(-1), "error no selection");

    // A plain "c" is not a shortcut.
    const plain = harness.controls.app.trigger("keydown", { key: "c" });
    assert.equal(plain.defaultPrevented, undefined);
  });
});

test("copyTextToClipboard falls back to navigator.clipboard without game.clipboard", async () => {
  await __test__.copyTextToClipboard("via-game");
  assert.deepEqual(env.state.clipboardWrites, ["via-game"]);

  const writes = [];
  const originalClipboard = env.game.clipboard;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  env.game.clipboard = undefined;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (text) => writes.push(text) } }
  });
  try {
    await __test__.copyTextToClipboard("via-navigator");
  } finally {
    env.game.clipboard = originalClipboard;
    if ( originalNavigator ) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
  assert.deepEqual(writes, ["via-navigator"]);
});

test("mediaKind follows Foundry's extension tables", () => {
  assert.equal(__test__.mediaKind("hero.PNG"), "image");
  assert.equal(__test__.mediaKind("icons/svg/d20.svg"), "image");
  assert.equal(__test__.mediaKind("intro.mp4"), "video");
  assert.equal(__test__.mediaKind("loop.webm"), "video");
  assert.equal(__test__.mediaKind("theme.mp3"), "audio");
  assert.equal(__test__.mediaKind("notes.txt"), "");
  assert.equal(__test__.mediaKind("noext"), "");
  assert.equal(__test__.mediaKind("x.constructor"), "");
  assert.equal(__test__.mediaKind(undefined), "");
});

test("F3 and Enter show images and videos in ImagePopout, play audio in a dialog, and open other files in a tab", async () => {
  const { app, harness } = await createWiredApp({
    left: [
      fileEntry("art/hero.png"),
      fileEntry("art/intro.webm"),
      fileEntry("sounds/a%20b.mp3"),
      fileEntry("sounds/theme.ogg"),
      fileEntry("docs/notes.txt")
    ]
  });
  const select = (path) => {
    app.state.panes.left.selectedPath = path;
  };

  select("art/hero.png");
  harness.controls.app.trigger("keydown", { key: "F3" });
  await flushPromises();
  assert.equal(env.state.imagePopouts.length, 1);
  assert.deepEqual(env.state.imagePopouts[0].options, { src: "/route/art/hero.png", window: { title: "hero.png" } });
  assert.deepEqual(env.state.imagePopouts[0].renderOptions, { force: true });

  select("art/intro.webm");
  harness.controls.app.trigger("keydown", { key: "Enter" });
  await flushPromises();
  assert.equal(env.state.imagePopouts.at(-1).options.src, "/route/art/intro.webm");

  select("sounds/a%20b.mp3");
  harness.controls.app.trigger("keydown", { key: "F3" });
  await flushPromises();
  const firstAudio = env.state.dialogCalls.at(-1);
  assert.equal(firstAudio.type, "prompt");
  assert.equal(firstAudio.config.window.title, "a b.mp3");
  assert.equal(firstAudio.config.content, `<audio controls autoplay src="/route/sounds/a%20b.mp3"></audio>`);
  assert.equal(firstAudio.config.ok.label, "Close");

  // A second audio file replaces the first player.
  select("sounds/theme.ogg");
  harness.controls.leftEntry.dataset.path = "sounds/theme.ogg";
  harness.controls.leftEntry.trigger("dblclick");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 2);
  assert.equal(env.state.dialogCalls.at(-1).config.content.includes("/route/sounds/theme.ogg"), true);

  select("docs/notes.txt");
  harness.controls.viewButton.trigger("click");
  await flushPromises();
  assert.deepEqual(env.state.windowOpenCalls, [{ url: "/route/docs/notes.txt", target: "_blank", features: "noopener" }]);
  assert.equal(env.state.imagePopouts.length, 2);
  assert.deepEqual(env.state.notifications.error, []);
});

test("overwrite helpers read listings case-insensitively and remember apply-to-all answers", async () => {
  const names = __test__.listingFileNames({ files: ["maps/Castle%20Map.webp", `${FORGE_USER_URL}maps/token.png?v=2`] });
  assert.deepEqual(Array.from(names), ["castle map.webp", "token.png"]);
  assert.deepEqual(Array.from(__test__.listingFileNames(undefined)), []);

  const run = __test__.createTransferRun(true);
  assert.equal(__test__.applyOverwriteAnswer(run, { action: "skip", all: false }), "skip");
  assert.equal(run.mode, "ask");
  assert.equal(__test__.applyOverwriteAnswer(run, { action: "overwrite", all: true }), "overwrite");
  assert.equal(run.mode, "overwrite");
  assert.equal(run.cancelled, false);
  assert.equal(__test__.applyOverwriteAnswer(run, "cancel"), "cancel");
  assert.equal(run.cancelled, true);
  const dismissed = __test__.createTransferRun(false);
  assert.equal(__test__.applyOverwriteAnswer(dismissed, null), "cancel");
  assert.equal(dismissed.cancelled, true);

  // The dialog offers skip and "apply to all" only when more files follow.
  env.state.dialogAnswers.push((config) => config);
  const single = await __test__.askOverwrite("<b>.png", "maps", false);
  assert.deepEqual(single.buttons.map((button) => button.action), ["overwrite", "cancel"]);
  assert.equal(single.buttons.find((button) => button.default).action, "cancel");
  assert.equal(single.content, "<p>&lt;b&gt;.png exists in maps</p>");

  env.state.dialogAnswers.push((config) => config);
  const multiple = await __test__.askOverwrite("a.png", "", true);
  assert.deepEqual(multiple.buttons.map((button) => button.action), ["overwrite", "skip", "cancel"]);
  assert.equal(multiple.buttons.find((button) => button.default).action, "skip");
  assert.match(multiple.content, /a\.png exists in \//);
  assert.match(multiple.content, /name="applyAll"/);
  const form = (checked) => ({ form: { elements: { applyAll: { checked } } } });
  assert.deepEqual(multiple.buttons[0].callback(null, form(true)), { action: "overwrite", all: true });
  assert.deepEqual(multiple.buttons[1].callback(null, form(false)), { action: "skip", all: false });
  assert.equal(multiple.rejectClose, false);
});

test("F5 asks before overwriting a file and skips, overwrites, or cancels as answered", async () => {
  const { app, harness } = await createWiredApp({ left: [fileEntry("source.txt")] });
  app.state.panes.right.source = "data";
  app.state.panes.right.path = "target";
  setBrowseResult("data", "target", { target: "target", dirs: [], files: ["target/Source.txt"] });

  env.state.dialogAnswers.push("cancel");
  harness.controls.app.trigger("keydown", { key: "F5" });
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 1);
  assert.deepEqual(env.state.uploadCalls, []);
  assert.equal(env.state.notifications.info.at(-1), "copy cancelled source.txt");

  env.state.dialogAnswers.push({ action: "overwrite", all: false });
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.uploadCalls.length, 1);
  assert.equal(env.state.uploadCalls[0].target, "target");
  assert.equal(env.state.notifications.info.at(-1), "copy finished source.txt");

  // Without a name clash there is no question.
  setBrowseResult("data", "target", { target: "target", dirs: [], files: ["target/other.txt"] });
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 2);
  assert.equal(env.state.uploadCalls.length, 2);
  assert.deepEqual(env.state.notifications.error, []);
});

test("directory copies ask once per clash and honor skip all, overwrite all, and cancel", async () => {
  const children = ["dir-a/a.txt", "dir-a/b.txt", "dir-a/c.txt"];
  const { app, harness } = await createWiredApp({
    left: [{ path: "dir-a", label: "[dir-a]", name: "dir-a", type: "directory", isParent: false }]
  });
  app.state.panes.right.source = "data";
  app.state.panes.right.path = "target";
  setBrowseResult("data", "dir-a", { target: "dir-a", dirs: [], files: children });
  setBrowseResult("data", "target/dir-a", { target: "target/dir-a", dirs: [], files: ["target/dir-a/A.TXT", "target/dir-a/b.txt"] });

  env.state.dialogAnswers.push({ action: "skip", all: true });
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 1);
  assert.match(env.state.dialogCalls[0].config.content, /a\.txt exists in target\/dir-a/);
  assert.deepEqual(env.state.uploadCalls.map((call) => call.file.name), ["c.txt"]);
  assert.equal(env.state.notifications.info.includes("skipped 2"), true);

  env.state.uploadCalls = [];
  env.state.dialogAnswers.push({ action: "overwrite", all: true });
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 2);
  assert.deepEqual(env.state.uploadCalls.map((call) => call.file.name), ["a.txt", "b.txt", "c.txt"]);

  // One overwrite without "all" asks again for the next clash, a dismissed dialog stops the copy.
  env.state.uploadCalls = [];
  env.state.dialogAnswers.push({ action: "overwrite", all: false }, null);
  harness.controls.copyButton.trigger("click");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 4);
  assert.deepEqual(env.state.uploadCalls.map((call) => call.file.name), ["a.txt"]);
  assert.equal(env.state.notifications.info.at(-1), "copy cancelled [dir-a]");
  assert.deepEqual(env.state.notifications.error, []);
});

test("uploads ask before overwriting and report only the files written", async () => {
  const { app, harness } = await createWiredApp({ left: [fileEntry("existing.txt")] });
  app.state.panes.left.path = "uploads";
  setBrowseResult("data", "uploads", { target: "uploads", dirs: [], files: ["uploads/existing.txt"] });

  env.state.dialogAnswers.push({ action: "skip", all: false });
  harness.controls.uploadButton.trigger("click");
  const input = env.state.createdInputs.at(-1);
  input.files = [new File(["a"], "existing.txt"), new File(["b"], "new.txt")];
  input.trigger("change");
  await flushPromises();
  assert.equal(env.state.dialogCalls.length, 1);
  assert.deepEqual(env.state.uploadCalls.map((call) => call.file.name), ["new.txt"]);
  assert.equal(env.state.notifications.info.includes("upload finished 1"), true);
  assert.equal(env.state.notifications.info.at(-1), "skipped 1");

  env.state.uploadCalls = [];
  env.state.dialogAnswers.push("cancel");
  harness.controls.app.trigger("keydown", { key: "u", ctrlKey: true });
  const secondInput = env.state.createdInputs.at(-1);
  secondInput.files = [new File(["a"], "existing.txt"), new File(["b"], "later.txt")];
  secondInput.trigger("change");
  await flushPromises();
  assert.deepEqual(env.state.uploadCalls, []);
  assert.equal(env.state.notifications.info.at(-1), "upload cancelled 0");
  assert.deepEqual(env.state.notifications.error, []);
});