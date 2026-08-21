import { resolve } from "node:path";
import type { ActionOptions, Bump, RequestedEngine } from "./types.js";

export interface InputReader {
  getInput(name: string): string;
}

const engines = new Set<RequestedEngine>(["auto", "godot", "unity", "unreal"]);
const bumps = new Set<Bump>(["major", "minor", "patch", "quad", "none"]);

export function readInputs(reader: InputReader, environment: NodeJS.ProcessEnv = process.env): ActionOptions {
  const engine = readEnum(reader, "engine", "auto", engines);
  const bump = readEnum(reader, "bump", "patch", bumps);
  const workingDirectory = resolve(
    reader.getInput("working-directory") || environment.GITHUB_WORKSPACE || process.cwd(),
  );
  const unityVersionProperties = parseProperties(reader.getInput("unity-version-properties"));
  const unityQuad = parseOptionalNumber(reader.getInput("unity-quad"), "unity-quad");

  return {
    engine,
    bump,
    workingDirectory,
    ...optional("projectPath", reader.getInput("project-path")),
    ...optional("version", reader.getInput("version")),
    ...optional("releaseLabel", reader.getInput("release-label")),
    ...optional("buildLabel", reader.getInput("build-label")),
    ...(unityQuad === undefined ? {} : { unityQuad }),
    dryRun: readBoolean(reader, "dry-run", false),
    allowNonSemver: readBoolean(reader, "allow-non-semver", false),
    stripLeadingV: readBoolean(reader, "strip-leading-v", false),
    unrealSection: reader.getInput("unreal-section") || "/Script/EngineSettings.GeneralProjectSettings",
    unrealKey: reader.getInput("unreal-key") || "ProjectVersion",
    unityVersionProperties,
    unityTreatBuildAsPatch: readBoolean(reader, "unity-treat-build-as-patch", true),
    unityTreatRevisionAsQuad: readBoolean(reader, "unity-treat-revision-as-quad", true),
  };
}

function readEnum<T extends string>(reader: InputReader, name: string, fallback: T, values: Set<T>): T {
  const value = (reader.getInput(name) || fallback).toLowerCase() as T;
  if (!values.has(value)) throw new Error(`${name} must be one of: ${[...values].join(", ")}.`);
  return value;
}

function readBoolean(reader: InputReader, name: string, fallback: boolean): boolean {
  const value = reader.getInput(name).trim().toLowerCase();
  if (value.length === 0) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function parseProperties(value: string): Record<string, string> {
  const source = value || '{"bundleVersion":"{major}.{minor}.{patch}"}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("unity-version-properties must be a JSON object mapping property names to format strings.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("unity-version-properties must be a JSON object mapping property names to format strings.");
  }
  for (const [key, format] of Object.entries(parsed)) {
    if (typeof format !== "string") throw new Error(`unity-version-properties.${key} must be a string.`);
  }
  return parsed as Record<string, string>;
}

function parseOptionalNumber(value: string, name: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

function optional<T extends string>(name: T, value: string): Partial<Record<T, string>> {
  return value.length === 0 ? {} : { [name]: value } as Partial<Record<T, string>>;
}
