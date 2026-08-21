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
