import {markSample, openSampleDialog, sampleActions, sampleId, closeSample} from "./samples.mjs";

// Sample windows of the File Commander: the real two-pane window over a made up folder tree held in memory. Nothing is
// browsed, uploaded, created or saved (the window class checks `isSample` and `sample` before every write).

const PEOPLE = ["archer", "cavalry-heavy", "cavalry", "charge", "cleric-grey", "cleric-orange", "commoner", "group",
  "infantry-armored", "infantry-army", "infantry", "spearfighter"].map(name => `icons/environment/people/${name}.webp`);
// A picture that ships with Foundry, so thumbnails really show something
const PORTRAITS = "icons/environment/people";
const MAPS = "assets/maps";
const HANDOUTS = "worlds/sample-world/handouts";

/** The made up folders: {path: {dirs: [], files: []}}, paths as Foundry lists them. Pure, no Foundry needed. */
export function sampleTree() {
  return {
    "": {dirs: ["assets", "icons", "worlds"], files: []},
    assets: {dirs: [MAPS, "assets/tokens"], files: ["assets/notes.txt"]},
    [MAPS]: {
      dirs: [],
      files: ["tavern-night.webp", "crypt-level-1.jpg", "crypt-level-2.jpg", "forest-road.png", "harbour.webp", "intro-scene.webm"].map(name => `${MAPS}/${name}`)
    },
    icons: {dirs: ["icons/environment"], files: []},
    "icons/environment": {dirs: [PORTRAITS], files: []},
    [PORTRAITS]: {dirs: [`${PORTRAITS}/old`], files: PEOPLE},
    "worlds/sample-world": {dirs: [HANDOUTS], files: []},
    [HANDOUTS]: {
      dirs: [`${HANDOUTS}/letters`],
      files: ["rumour-board.webp", "wanted-poster.png", "tavern-song.ogg", "town-ledger.pdf", "map-fragment.jpg"].map(name => `${HANDOUTS}/${name}`)
    }
  };
}

/** What FilePicker.browse gives for a path of the sample tree (nothing for a path it does not know). */
export function sampleBrowse(tree, target) {
  const path = String(target ?? "").split("/").filter(Boolean).join("/");
  const entry = tree[path] ?? {dirs: [], files: []};
  return {target: path, dirs: [...entry.dirs], files: [...entry.files], gridSize: null, private: false, privateDirs: [], privateFiles: []};
}

/**
 * The entries of the sample windows.
 * @param {{App: Function, localize: Function, overwriteDialog: Function, newFolderContent: Function,
 *   audioContent: Function, moduleId: string}} context  what the module hands over (its window class and dialog builders)
 */
export function sampleWindows({App, localize, overwriteDialog, newFolderContent, audioContent, moduleId}) {
  const group = localize("SFC.Title");
  const tree = sampleTree();
  const sample = {browse: (_source, target) => sampleBrowse(tree, target)};

  const openCommander = async (id, {left, right, progress = null, readOnly = false, browse = sample.browse}) => {
    const appId = sampleId(moduleId, id);
    await closeSample(appId);
    const width = Math.min(1360, Math.max(720, window.innerWidth - 40));
    const height = Math.min(820, Math.max(520, window.innerHeight - 40));
    const app = new App({
      id: appId,
      position: {width, height},
      actions: sampleActions(App, ["switch-pane", "refresh", "openSettings"])
    });
    markSample(app);
    app.sample = {browse, readOnly};
    app.session.activePane = "left";
    for ( const [side, setup] of [["left", left], ["right", right]] ) {
      Object.assign(app.session.panes[side], {source: "data", bucket: "", loaded: false, view: "list", selectedPath: "", ...setup});
    }
    if ( progress ) app.sampleProgress = progress;
    await app.render({force: true});
    return app;
  };

  const question = (id, label, options) => ({
    id, label, group,
    open: () => openSampleDialog({moduleId, id, ...options()})
  });
  const dialogOf = (name, directory, multiple) => () => {
    const {position, content, buttons} = overwriteDialog(name, directory, multiple);
    return {
      title: localize("SFC.Dialog.Overwrite.Title"),
      width: position.width,
      content,
      buttons: buttons.map(({action, icon, default: isDefault}) => ({
        label: localize(`SFC.Dialog.Overwrite.${action[0].toUpperCase()}${action.slice(1)}`), icon, default: isDefault
      }))
    };
  };

  return [
    {
      id: "grid", label: localize("SFC.Sample.Grid"), group,
      open: () => openCommander("grid", {
        left: {path: PORTRAITS, view: "grid", selectedPath: PEOPLE[5]},
        right: {path: HANDOUTS}
      })
    },
    {
      id: "upload", label: localize("SFC.Sample.Upload"), group,
      open: () => openCommander("upload", {
        left: {path: ""},
        right: {path: MAPS},
        progress: {done: 3, total: 8, name: "forest-road.png", run: {cancelled: false}}
      })
    },
    {
      id: "cancelling", label: localize("SFC.Sample.Cancelling"), group,
      open: () => openCommander("cancelling", {
        left: {path: ""},
        right: {path: MAPS},
        progress: {done: 5, total: 8, name: "harbour.webp", run: {cancelled: true}}
      })
    },
    {
      // An empty folder (only the root can be empty, deeper folders list the parent entry) and a pane that cannot load (S3 without a bucket)
      id: "problems", label: localize("SFC.Sample.Problems"), group,
      open: () => openCommander("problems", {
        left: {path: ""},
        right: {source: "s3", path: ""},
        browse: () => sampleBrowse({}, "")
      })
    },
    {
      id: "readonly", label: localize("SFC.Sample.ReadOnly"), group,
      open: () => openCommander("readonly", {
        left: {path: MAPS, selectedPath: `${MAPS}/harbour.webp`},
        right: {path: HANDOUTS},
        readOnly: true
      })
    },
    question("overwrite-one", localize("SFC.Sample.OverwriteOne"), dialogOf("tavern-night.webp", MAPS, false)),
    question("overwrite-many", localize("SFC.Sample.OverwriteMany"), dialogOf("tavern-night.webp", MAPS, true)),
    question("new-folder", localize("SFC.Sample.NewFolder"), () => ({
      title: localize("SFC.Dialog.NewFolder.Title"),
      width: 400,
      content: newFolderContent(),
      buttons: [{label: localize("SFC.Dialog.NewFolder.Confirm"), icon: "fa-solid fa-check", default: true}]
    })),
    question("audio", localize("SFC.Sample.Audio"), () => ({
      title: localize("SFC.Sample.Audio"),
      width: 400,
      content: audioContent("sounds/dice.wav", false),
      buttons: [{label: localize("SFC.Dialog.Audio.Close"), icon: "fa-solid fa-xmark", default: true}]
    }))
  ];
}

export const __test__ = {PEOPLE};
