import { basename, join, resolve } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { updateGodotProjectVersion } from "@bigfootds/godot-semver-updater";
import { updateNodeProjectVersion } from "@bigfootds/nodejs-semver-updater";
import { ProjectSettingsHelpers, UnityProjectVersion } from "@bigfootds/unity-semver-updater";
import { updateUnrealProjectVersion } from "@bigfootds/unreal-semver-updater";
import type { PlayerSettingsVersionStrings } from "@bigfootds/unity-semver-updater";
import { resolveProject } from "./engine.js";
import { applyLabels, bumpSemanticVersion, formatSemanticVersion, parseSemanticVersion } from "./semver.js";
import type { ActionOptions, ResolvedProject, UpdateResult } from "./types.js";

const unityStringProperties = new Set([
  "bundleVersion",
  "switchReleaseVersion",
  "switchDisplayVersion",
  "ps4MasterVersion",
  "ps4AppVersion",
  "metroPackageVersion",
  "XboxOneVersion",
  "psp2MasterVersion",
  "psp2AppVersion",
]);

export async function updateProject(options: ActionOptions): Promise<UpdateResult> {
  const project = await resolveProject(options.engine, options.workingDirectory, options.projectPath);
  switch (project.engine) {
    case "godot": return updateGodot(project, options);
    case "nodejs": return updateNodejs(project, options);
    case "unity": return updateUnity(project, options);
    case "unreal": return updateUnreal(project, options);
  }
}

/**
 * Updates the package manifest, plus any explicitly configured JSON version
 * properties, using the updater bundled into this action.
 */
async function updateNodejs(
  project: ResolvedProject,
  options: ActionOptions,
): Promise<UpdateResult> {
  const previousVersion = readNodejsPackageVersion(await readFile(project.projectPath, "utf8"), project.projectPath);
  const version = deriveSemanticVersion(previousVersion, options);
  const result = await updateNodeProjectVersion({
    packagePath: project.projectPath,
    version,
    additionalVersionProperties: options.nodejsVersionProperties.map((property) => ({
      ...property,
      filePath: resolve(options.workingDirectory, property.filePath),
    })),
    validateSemver: !options.allowNonSemver,
    dryRun: options.dryRun,
  });
  return {
    engine: project.engine,
    projectPath: project.projectPath,
    ...(result.previousVersion === undefined ? {} : { previousVersion: result.previousVersion }),
    version,
    changed: result.changed,
    fullData: { version, properties: result.properties },
  };
}

async function updateGodot(
  project: ResolvedProject,
  options: ActionOptions,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const previousVersion = readGodotVersion(original);
  const version = deriveSemanticVersion(previousVersion, options);
  const result = await updateGodotProjectVersion({
    projectPath: project.projectPath,
    version,
    validateSemver: !options.allowNonSemver,
    dryRun: options.dryRun,
  });
  return {
    engine: project.engine,
    projectPath: project.projectPath,
    ...(result.previousVersion === undefined ? {} : { previousVersion: result.previousVersion }),
    version,
    changed: result.changed,
    fullData: { version },
  };
}

async function updateUnreal(
  project: ResolvedProject,
  options: ActionOptions,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const previousVersion = readIniValue(original, options.unrealSection, options.unrealKey);
  const version = deriveSemanticVersion(previousVersion, options);
  const result = await updateUnrealProjectVersion({
    projectPath: project.projectPath,
    version,
    section: options.unrealSection,
    key: options.unrealKey,
    validateSemver: !options.allowNonSemver,
    dryRun: options.dryRun,
  });
  return {
    engine: project.engine,
    projectPath: project.projectPath,
    ...(result.previousVersion === undefined ? {} : { previousVersion: result.previousVersion }),
    version,
    changed: result.changed,
    fullData: { version, section: options.unrealSection, key: options.unrealKey },
  };
}

async function updateUnity(
  project: ResolvedProject,
  options: ActionOptions,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const existing = await ProjectSettingsHelpers.getExistingBundleVersion(project.projectPath);
  const previousVersion = existing?.toString();
  const version = deriveUnityVersion(existing, options);
  const properties = createUnityProperties(options, version);
  const changed = await writeUnityVersion(project.projectPath, original, properties, options.dryRun);

  return {
    engine: project.engine,
    projectPath: project.projectPath,
    ...(previousVersion === undefined ? {} : { previousVersion }),
    version: version.toString(),
    changed,
    fullData: {
      major: version.major,
      minor: version.minor,
      patch: version.patch,
      quad: version.quad,
      build: version.build,
      revision: version.revision,
      releaseLabel: version.releaseLabel,
      buildLabel: version.buildLabel,
      properties,
    },
  };
}

function deriveSemanticVersion(previousVersion: string | undefined, options: ActionOptions): string {
  const requested = normalizeRequestedVersion(options);
  if (requested !== undefined) return requested;
  if (previousVersion === undefined) {
    throw new Error("No existing version was found. Supply the version input to create an initial version.");
  }
  if (options.bump === "quad") throw new Error("bump: quad is only supported for Unity projects.");
  const parsed = parseSemanticVersion(previousVersion);
  const bumped = bumpSemanticVersion(parsed, options.bump);
  return formatSemanticVersion(applyLabels(bumped, options.releaseLabel, options.buildLabel));
}

function deriveUnityVersion(
  existing: UnityProjectVersion | null,
  options: ActionOptions,
): UnityProjectVersion {
  const requested = normalizeRequestedVersion(options);
  let version: UnityProjectVersion;
  if (requested !== undefined) {
    if (options.allowNonSemver) {
      throw new Error("allow-non-semver is not supported for Unity because Unity version fields require a semantic version.");
    }
    const parsed = parseSemanticVersion(requested);
    version = new UnityProjectVersion(
      parsed.major,
      parsed.minor,
      parsed.patch,
      options.unityQuad ?? existing?.quad ?? 0,
      parsed.prerelease ?? "",
      parsed.build ?? "",
      requested,
      options.unityTreatBuildAsPatch,
      options.unityTreatRevisionAsQuad,
    );
  } else {
    if (existing === null) throw new Error("No existing Unity bundleVersion was found. Supply the version input to create one.");
    version = existing;
    version.treatBuildAsPatch = options.unityTreatBuildAsPatch;
    version.treatRevisionAsQuad = options.unityTreatRevisionAsQuad;
    switch (options.bump) {
      case "major": version.bumpMajor(); break;
      case "minor": version.bumpMinor(); break;
      case "patch": version.bumpPatch(); break;
      case "quad": version.bumpQuad(); break;
      case "none": break;
    }
    if (options.bump !== "none") {
      version.releaseLabel = "";
      version.buildLabel = "";
    }
  }
  if (options.unityQuad !== undefined) version.quad = options.unityQuad;
  if (options.releaseLabel !== undefined && options.releaseLabel.length > 0) version.releaseLabel = options.releaseLabel;
  if (options.buildLabel !== undefined && options.buildLabel.length > 0) version.buildLabel = options.buildLabel;
  parseSemanticVersion(version.toString());
  return version;
}

function createUnityProperties(options: ActionOptions, version: UnityProjectVersion): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    bundleVersion: null,
    buildNumber: null,
    switchReleaseVersion: null,
    switchDisplayVersion: null,
    ps4MasterVersion: null,
    ps4AppVersion: null,
    metroPackageVersion: null,
    XboxOneVersion: null,
    psp2MasterVersion: null,
    psp2AppVersion: null,
  };
  for (const [property, format] of Object.entries(options.unityVersionProperties)) {
    if (!unityStringProperties.has(property)) {
      throw new Error(`unity-version-properties contains unsupported property ${JSON.stringify(property)}.`);
    }
    properties[property] = version.toFormattedOutput(format);
  }
  return properties;
}

async function writeUnityVersion(
  projectPath: string,
  original: string,
  properties: Record<string, unknown>,
  dryRun: boolean,
): Promise<boolean> {
  if (!dryRun) {
    await ProjectSettingsHelpers.writeToProjectSettings(projectPath, properties as PlayerSettingsVersionStrings);
    return (await readFile(projectPath, "utf8")) !== original;
  }
  const directory = await mkdtemp(join(tmpdir(), "game-semver-unity-dry-run-"));
  const temporaryPath = join(directory, basename(projectPath));
  try {
    await writeFile(temporaryPath, original, "utf8");
    await ProjectSettingsHelpers.writeToProjectSettings(temporaryPath, properties as PlayerSettingsVersionStrings);
    return (await readFile(temporaryPath, "utf8")) !== original;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function normalizeRequestedVersion(options: ActionOptions): string | undefined {
  if (options.version === undefined) return undefined;
  const version = options.stripLeadingV && options.version.startsWith("v") ? options.version.slice(1) : options.version;
  if (options.allowNonSemver) {
    if (options.releaseLabel !== undefined || options.buildLabel !== undefined) {
      throw new Error("release-label and build-label require a semantic version.");
    }
    return version;
  }
  return formatSemanticVersion(applyLabels(parseSemanticVersion(version), options.releaseLabel, options.buildLabel));
}

function readNodejsPackageVersion(content: string, packagePath: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${JSON.stringify(packagePath)} is not valid JSON: ${reason}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${JSON.stringify(packagePath)} must contain a JSON object at its root.`);
  }
  const version = (parsed as Record<string, unknown>).version;
  if (version === undefined) return undefined;
  if (typeof version !== "string") {
    throw new Error(`${JSON.stringify(packagePath)} must contain a string version property.`);
  }
  return version;
}

function readGodotVersion(content: string): string | undefined {
  const section = findSection(content, "application");
  if (section === undefined) return undefined;
  const match = /^[\t ]*config\/version[\t ]*=[\t ]*(.*?)\s*$/m.exec(section);
  if (match?.[1] === undefined) return undefined;
  const value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return value; }
  }
  return value.length === 0 ? undefined : value;
}

function readIniValue(content: string, sectionName: string, key: string): string | undefined {
  const section = findSection(content, sectionName);
  if (section === undefined) return undefined;
  const escapedKey = escapeRegex(key);
  const match = new RegExp(`^[\\t ]*${escapedKey}[\\t ]*=[\\t ]*(.*?)\\s*$`, "m").exec(section);
  if (match?.[1] === undefined) return undefined;
  const value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return value; }
  }
  return value.length === 0 ? undefined : value;
}

function findSection(content: string, name: string): string | undefined {
  const sectionPattern = /^[\t ]*\[([^\]]+)\][\t ]*(?:[;#].*)?\r?$/gm;
  let match: RegExpExecArray | null;
  let bodyStart: number | undefined;
  while ((match = sectionPattern.exec(content)) !== null) {
    if (bodyStart !== undefined) return content.slice(bodyStart, match.index);
    if (match[1] === name) bodyStart = match.index + match[0].length;
  }
  return bodyStart === undefined ? undefined : content.slice(bodyStart);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
