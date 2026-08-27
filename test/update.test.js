const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { updateProject } = require("../lib/update.js");

test("updates a Godot project through the statically linked updater", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-update-"));
  const projectPath = join(directory, "project.godot");
  const original = "[application]\nconfig/version=\"1.0.0\"\n";
  await writeFile(projectPath, original, "utf8");

  try {
    const result = await updateProject({
      engine: "godot",
      workingDirectory: directory,
      bump: "patch",
      version: "1.2.3",
      dryRun: true,
      allowNonSemver: false,
      stripLeadingV: false,
      unrealSection: "/Script/EngineSettings.GeneralProjectSettings",
      unrealKey: "ProjectVersion",
      unityVersionProperties: { bundleVersion: "{major}.{minor}.{patch}" },
      unityTreatBuildAsPatch: true,
      unityTreatRevisionAsQuad: true,
    });

    assert.equal(result.version, "1.2.3");
    assert.equal(result.previousVersion, "1.0.0");
    assert.equal(result.changed, true);
    assert.equal(await readFile(projectPath, "utf8"), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updates a Node.js package and configured JSON version properties through the bundled updater", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-update-"));
  const packagePath = join(directory, "package.json");
  const metadataPath = join(directory, "game-version.json");
  await writeFile(packagePath, '{"name":"example","version":"1.0.0","build":{"buildVersion":"1.0.0"}}\n', "utf8");
  await writeFile(metadataPath, '{"version":"1.0.0"}\n', "utf8");

  try {
    const result = await updateProject({
      engine: "nodejs",
      workingDirectory: directory,
      bump: "patch",
      version: "1.2.3",
      dryRun: false,
      allowNonSemver: false,
      stripLeadingV: false,
      unrealSection: "/Script/EngineSettings.GeneralProjectSettings",
      unrealKey: "ProjectVersion",
      unityVersionProperties: { bundleVersion: "{major}.{minor}.{patch}" },
      unityTreatBuildAsPatch: true,
      unityTreatRevisionAsQuad: true,
      nodejsVersionProperties: [
        { filePath: "package.json", jsonPointer: "/build/buildVersion" },
        { filePath: "game-version.json", jsonPointer: "/version" },
      ],
    });

    assert.equal(result.engine, "nodejs");
    assert.equal(result.projectPath, packagePath);
    assert.equal(result.previousVersion, "1.0.0");
    assert.equal(result.version, "1.2.3");
    assert.equal(result.changed, true);
    assert.deepEqual(JSON.parse(await readFile(packagePath, "utf8")), {
      name: "example",
      version: "1.2.3",
      build: { buildVersion: "1.2.3" },
    });
    assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")), { version: "1.2.3" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
