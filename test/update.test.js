const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { updateProject } = require("../lib/update.js");

function options(directory, engine, overrides = {}) {
  return {
    engine,
    workingDirectory: directory,
    bump: "patch",
    dryRun: false,
    allowNonSemver: false,
    stripLeadingV: false,
    unrealSection: "/Script/EngineSettings.GeneralProjectSettings",
    unrealKey: "ProjectVersion",
    unityVersionProperties: { bundleVersion: "{major}.{minor}.{patch}" },
    unityTreatBuildAsPatch: true,
    unityTreatRevisionAsQuad: true,
    nodejsVersionProperties: [],
    ...overrides,
  };
}

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

test("uses the same literal version format for Godot and Unreal projects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-format-"));
  const godotPath = join(directory, "project.godot");
  const unrealDirectory = join(directory, "Config");
  const unrealPath = join(unrealDirectory, "DefaultGame.ini");
  await require("node:fs/promises").mkdir(unrealDirectory);
  await writeFile(godotPath, '[application]\nconfig/version="v1.0.0-demo"\n', "utf8");
  await writeFile(unrealPath, "[/Script/EngineSettings.GeneralProjectSettings]\nProjectVersion=v1.0.0-demo\n", "utf8");

  try {
    const format = "v{major}.{minor}.{patch}-demo";
    const godot = await updateProject(options(directory, "godot", { versionFormat: format }));
    const unreal = await updateProject(options(directory, "unreal", { versionFormat: format }));

    assert.equal(godot.previousVersion, "1.0.0");
    assert.equal(godot.version, "1.0.1");
    assert.equal(unreal.previousVersion, "1.0.0");
    assert.equal(unreal.version, "1.0.1");
    assert.match(await readFile(godotPath, "utf8"), /config\/version="v1\.0\.1-demo"/);
    assert.match(await readFile(unrealPath, "utf8"), /ProjectVersion=v1\.0\.1-demo/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("re-parses a literal Unity bundle version on each bump", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-format-"));
  const settingsDirectory = join(directory, "ProjectSettings");
  const projectPath = join(settingsDirectory, "ProjectSettings.asset");
  await require("node:fs/promises").mkdir(settingsDirectory);
  await writeFile(projectPath, "PlayerSettings:\n  bundleVersion: Version 1.0.0 beta\n", "utf8");

  try {
    const unityOptions = options(directory, "unity", {
      versionFormat: "Version {major}.{minor}.{patch} beta",
    });
    const first = await updateProject(unityOptions);
    const second = await updateProject(unityOptions);

    assert.equal(first.version, "1.0.1");
    assert.equal(second.previousVersion, "1.0.1");
    assert.equal(second.version, "1.0.2");
    assert.match(await readFile(projectPath, "utf8"), /bundleVersion: Version 1\.0\.2 beta/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps package.json SemVer while a Node.js display version is formatted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-format-"));
  const packagePath = join(directory, "package.json");
  await writeFile(
    packagePath,
    '{"name":"example","version":"1.0.0","gameVersion":"Game v1.0.0-beta","desktopVersion":"v1.0.0"}\n',
    "utf8",
  );

  try {
    const result = await updateProject(options(directory, "nodejs", {
      versionFormat: "Game v{major}.{minor}.{patch}-beta",
      nodejsVersionSource: { filePath: "package.json", jsonPointer: "/gameVersion" },
      nodejsVersionProperties: [{
        filePath: "package.json",
        jsonPointer: "/desktopVersion",
        format: "v{major}.{minor}.{patch}",
      }],
    }));

    assert.equal(result.previousVersion, "1.0.0");
    assert.equal(result.version, "1.0.1");
    assert.deepEqual(JSON.parse(await readFile(packagePath, "utf8")), {
      name: "example",
      version: "1.0.1",
      gameVersion: "Game v1.0.1-beta",
      desktopVersion: "v1.0.1",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validates Node.js display targets before changing package.json", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-format-"));
  const packagePath = join(directory, "package.json");
  const original = '{"name":"example","version":"1.0.0"}\n';
  await writeFile(packagePath, original, "utf8");

  try {
    await assert.rejects(
      updateProject(options(directory, "nodejs", {
        nodejsVersionProperties: [{
          filePath: "package.json",
          jsonPointer: "/gameVersion",
          format: "Game v{major}.{minor}.{patch}",
        }],
      })),
      /does not exist/,
    );
    assert.equal(await readFile(packagePath, "utf8"), original);
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
