import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Engine, RequestedEngine, ResolvedProject } from "./types.js";

const defaults: Record<Engine, string> = {
  godot: "project.godot",
  nodejs: "package.json",
  unity: "ProjectSettings/ProjectSettings.asset",
  unreal: "Config/DefaultGame.ini",
};

export async function resolveProject(
  engine: RequestedEngine,
  workingDirectory: string,
  requestedPath: string | undefined,
): Promise<ResolvedProject> {
  if (requestedPath !== undefined) {
    const projectPath = resolve(workingDirectory, requestedPath);
    const resolvedEngine = engine === "auto" ? engineForPath(projectPath, true) : engine;
    if (resolvedEngine === undefined) {
      throw new Error("Unable to infer the engine from project-path. Set the engine input explicitly.");
    }
    return { engine: resolvedEngine, projectPath };
  }
  if (engine !== "auto") return { engine, projectPath: join(workingDirectory, defaults[engine]) };

  const candidates = await findCandidates(workingDirectory);
  if (candidates.length === 0) {
    throw new Error("Unable to find a Godot, Unity, or Unreal project. Set engine and project-path explicitly.");
  }
  if (candidates.length > 1) {
    throw new Error(`Found multiple game project settings files: ${candidates.map((candidate) => candidate.projectPath).join(", ")}. Set engine and project-path explicitly.`);
  }
  return candidates[0] as ResolvedProject;
}

function engineForPath(projectPath: string, includeNodejs: boolean): Engine | undefined {
  const fileName = basename(projectPath);
  if (fileName === "project.godot") return "godot";
  if (includeNodejs && fileName === "package.json") return "nodejs";
  if (fileName === "ProjectSettings.asset") return "unity";
  if (fileName === "DefaultGame.ini") return "unreal";
  return undefined;
}

async function findCandidates(root: string): Promise<ResolvedProject[]> {
  const candidates: ResolvedProject[] = [];
  await walk(root, candidates, 0);
  return candidates;
}

async function walk(directory: string, candidates: ResolvedProject[], depth: number): Promise<void> {
  if (depth > 5) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, candidates, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    const engine = engineForPath(path, false);
    if (engine !== undefined) candidates.push({ engine, projectPath: path });
  }
}
