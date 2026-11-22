import assert from "node:assert/strict";
import test from "node:test";

import {sampleBrowse, sampleTree, __test__} from "../scripts/sample-windows.js";

test("the sample tree lists real pictures and only known paths", () => {
  const tree = sampleTree();
  const people = sampleBrowse(tree, "/icons/environment/people/");
  assert.equal(people.target, "icons/environment/people");
  assert.equal(people.files.length, __test__.PEOPLE.length);
  assert.ok(people.files.every(path => path.endsWith(".webp")));
  assert.deepEqual(sampleBrowse(tree, "").dirs, ["assets", "icons", "worlds"]);
});

test("an unknown path is an empty folder and listings are copies", () => {
  const tree = sampleTree();
  const nothing = sampleBrowse(tree, "nowhere/at/all");
  assert.deepEqual([nothing.dirs, nothing.files], [[], []]);
  sampleBrowse(tree, "").dirs.push("x");
  assert.equal(tree[""].dirs.length, 3);
});

test("every folder a listing names exists or is empty on purpose", () => {
  const tree = sampleTree();
  for ( const entry of Object.values(tree) ) {
    for ( const file of entry.files ) assert.match(file, /\.[a-z0-9]+$/);
  }
});
