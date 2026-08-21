const assert = require("node:assert/strict");
const test = require("node:test");
const { readInputs } = require("../lib/inputs.js");

function reader(values) {
  return { getInput: (name) => values[name] ?? "" };
}

test("uses safe defaults for a conventional patch release", () => {
  const options = readInputs(reader({}), { GITHUB_WORKSPACE: "/workspace" });
  assert.equal(options.engine, "auto");
  assert.equal(options.bump, "patch");
  assert.equal(options.workingDirectory, "/workspace");
  assert.equal(options.unrealSection, "/Script/EngineSettings.GeneralProjectSettings");
  assert.deepEqual(options.unityVersionProperties, { bundleVersion: "{major}.{minor}.{patch}" });
});

test("accepts configurable project and Unity settings", () => {
  const options = readInputs(reader({
    engine: "unity",
    "project-path": "games/main/ProjectSettings/ProjectSettings.asset",
    bump: "quad",
    "unity-quad": "17",
    "unity-version-properties": '{"bundleVersion":"{major}.{minor}.{patch}","metroPackageVersion":"{major}.{minor}.{patch}.{quad}"}',
  }), { GITHUB_WORKSPACE: "/workspace" });
  assert.equal(options.engine, "unity");
  assert.equal(options.bump, "quad");
  assert.equal(options.unityQuad, 17);
  assert.equal(options.unityVersionProperties.metroPackageVersion, "{major}.{minor}.{patch}.{quad}");
});

test("rejects malformed input", () => {
  assert.throws(() => readInputs(reader({ bump: "banana" })), /bump must be one of/);
  assert.throws(() => readInputs(reader({ "dry-run": "maybe" })), /dry-run must be true or false/);
  assert.throws(() => readInputs(reader({ "unity-version-properties": "[]" })), /JSON object/);
});
