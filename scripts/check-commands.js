#!/usr/bin/env node
"use strict";

const assert = require("assert");
const rc = require("../region-commands.js");

const cal = rc.build(
  ["us"],
  [{ code: "california" }, { code: "norcal" }, { code: "humboldt" }],
  []
);
assert.strictEqual(cal.defLine, "region def us california norcal humboldt");
assert.strictEqual(
  cal.putText,
  [
    "region put us",
    "region put california us",
    "region put norcal california",
    "region put humboldt norcal",
    "region default humboldt",
    "region save"
  ].join("\n")
);
assert.strictEqual(cal.blocked, false);
assert.strictEqual(cal.defTooLong, false);

const utah = rc.build(
  ["us"],
  [{ code: "utah", tags: ["imw"], placeholder: true }],
  ["imw"]
);
assert.strictEqual(utah.defLine, "region def us utah|us imw");
assert.strictEqual(utah.blocked, true);
assert.ok(utah.putText.includes("region put imw us"));
assert.ok(utah.putText.includes("region default utah"));

const noTag = rc.build(["us"], [{ code: "utah", tags: ["imw"], placeholder: true }], []);
assert.strictEqual(noTag.defLine, "region def us utah");

const nv = rc.build(
  ["us"],
  [{ code: "imw" }, { code: "nv" }, { code: "churchill" }],
  []
);
assert.strictEqual(nv.defLine, "region def us imw nv churchill");
assert.strictEqual(nv.blocked, false);

const nvSibling = rc.build(
  ["us"],
  [{ code: "imw" }, { code: "nv" }, { code: "churchill" }],
  [],
  {},
  [{ code: "washoe", parent: "nv" }]
);
assert.strictEqual(nvSibling.defLine, "region def us imw nv churchill|nv washoe");
assert.ok(nvSibling.putText.includes("region put imw us"));
assert.ok(nvSibling.putText.includes("region put washoe nv"));

const inherited = rc.inheritedTags([
  { code: "utah", tags: ["imw"] },
  { code: "child", tags: ["imw", "pnw"] }
]);
assert.deepStrictEqual(inherited, ["imw", "pnw"]);

console.log("region commands ok");
