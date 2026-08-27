const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { resolveProject } = require("../lib/engine.js");

test("detects a single nested game project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-engine-"));
  await mkdir(join(directory, "game", "Config"), { recursive: true });
  await writeFile(join(directory, "game", "Config", "DefaultGame.ini"), "[Build]\nVersion=1.0.0\n");

  const project = await resolveProject("auto", directory, undefined);
  assert.equal(project.engine, "unreal");
  assert.equal(project.projectPath, join(directory, "game", "Config", "DefaultGame.ini"));
});

test("requires explicit selection when auto-detection is ambiguous", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-engine-"));
  await mkdir(join(directory, "ProjectSettings"));
  await writeFile(join(directory, "project.godot"), "[application]\n");
  await writeFile(join(directory, "ProjectSettings", "ProjectSettings.asset"), "PlayerSettings:\n");

  await assert.rejects(resolveProject("auto", directory, undefined), /multiple game project settings files/);
});

test("resolves Node.js package manifests when Node.js is selected explicitly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-engine-"));
  const packagePath = join(directory, "package.json");
  await writeFile(packagePath, '{"name":"example","version":"1.0.0"}\n');

  const project = await resolveProject("nodejs", directory, undefined);
  assert.deepEqual(project, { engine: "nodejs", projectPath: packagePath });

  const inferredProject = await resolveProject("auto", directory, "package.json");
  assert.deepEqual(inferredProject, { engine: "nodejs", projectPath: packagePath });
});

test("does not let an incidental Node.js package manifest make auto-detection ambiguous", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-engine-"));
  await writeFile(join(directory, "package.json"), '{"name":"tools"}\n');
  await writeFile(join(directory, "project.godot"), "[application]\n");

  const project = await resolveProject("auto", directory, undefined);
  assert.equal(project.engine, "godot");
  assert.equal(project.projectPath, join(directory, "project.godot"));
});
