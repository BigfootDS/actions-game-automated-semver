import { basename, join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getPackageSpec, resolveProject } from "./engine.js";
import { withEnginePackage } from "./packages.js";
import { applyLabels, bumpSemanticVersion, formatSemanticVersion, parseSemanticVersion } from "./semver.js";
import type { ActionOptions, Engine, ResolvedProject, UpdateResult } from "./types.js";

type UpdateGodot = (options: {
  projectPath: string;
  version: string;
  validateSemver: boolean;
  dryRun: boolean;
}) => Promise<{ previousVersion?: string; changed: boolean }>;

type UpdateUnreal = (options: {
  projectPath: string;
  version: string;
  section: string;
  key: string;
  validateSemver: boolean;
  dryRun: boolean;
}) => Promise<{ previousVersion?: string; changed: boolean }>;

interface UnityVersion {
  major: number;
  minor: number;
  patch: number;
  quad: number;
  build: number;
  revision: number;
  releaseLabel: string;
  buildLabel: string;
  treatBuildAsPatch: boolean;
  treatRevisionAsQuad: boolean;
  bumpMajor(): void;
  bumpMinor(): void;
  bumpPatch(): void;
  bumpQuad(): void;
  toString(): string;
  toFormattedOutput(format: string): string;
}

interface UnityPackage {
  ProjectSettingsHelpers: {
    getExistingBundleVersion(path: string): Promise<UnityVersion | null>;
    writeToProjectSettings(path: string, properties: Record<string, unknown>): Promise<boolean>;
  };
  UnityProjectVersion: new (
    major: number,
    minor: number,
    patch: number,
    quad: number,
    releaseLabel: string,
    buildLabel: string,
    rawString: string,
    treatBuildAsPatch: boolean,
    treatRevisionAsQuad: boolean,
  ) => UnityVersion;
}

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
  const packageSpec = getPackageSpec(project.engine, options.enginePackage, options.enginePackageVersion);
  return withEnginePackage(packageSpec.name, packageSpec.spec, async (enginePackage) => {
    switch (project.engine) {
      case "godot": return updateGodot(project, options, enginePackage);
      case "unity": return updateUnity(project, options, enginePackage as unknown as UnityPackage);
      case "unreal": return updateUnreal(project, options, enginePackage);
    }
  });
}

async function updateGodot(
  project: ResolvedProject,
  options: ActionOptions,
  enginePackage: Record<string, unknown>,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const previousVersion = readGodotVersion(original);
  const version = deriveSemanticVersion(previousVersion, options);
  const update = requireFunction<UpdateGodot>(enginePackage, "updateGodotProjectVersion");
  const result = await update({
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
  enginePackage: Record<string, unknown>,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const previousVersion = readIniValue(original, options.unrealSection, options.unrealKey);
  const version = deriveSemanticVersion(previousVersion, options);
  const update = requireFunction<UpdateUnreal>(enginePackage, "updateUnrealProjectVersion");
  const result = await update({
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
  unityPackage: UnityPackage,
): Promise<UpdateResult> {
  const original = await readFile(project.projectPath, "utf8");
  const existing = await unityPackage.ProjectSettingsHelpers.getExistingBundleVersion(project.projectPath);
  const previousVersion = existing?.toString();
  const version = deriveUnityVersion(existing, options, unityPackage);
  const properties = createUnityProperties(options, version);
  const changed = await writeUnityVersion(project.projectPath, original, properties, options.dryRun, unityPackage);

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
  existing: UnityVersion | null,
  options: ActionOptions,
  unityPackage: UnityPackage,
): UnityVersion {
  const requested = normalizeRequestedVersion(options);
  let version: UnityVersion;
  if (requested !== undefined) {
    if (options.allowNonSemver) {
      throw new Error("allow-non-semver is not supported for Unity because Unity version fields require a semantic version.");
    }
    const parsed = parseSemanticVersion(requested);
    version = new unityPackage.UnityProjectVersion(
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

function createUnityProperties(options: ActionOptions, version: UnityVersion): Record<string, unknown> {
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
  unityPackage: UnityPackage,
): Promise<boolean> {
  if (!dryRun) {
    await unityPackage.ProjectSettingsHelpers.writeToProjectSettings(projectPath, properties);
    return (await readFile(projectPath, "utf8")) !== original;
  }
  const directory = await mkdtemp(join(tmpdir(), "game-semver-unity-dry-run-"));
  const temporaryPath = join(directory, basename(projectPath));
  try {
    await writeFile(temporaryPath, original, "utf8");
    await unityPackage.ProjectSettingsHelpers.writeToProjectSettings(temporaryPath, properties);
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

function requireFunction<T>(source: Record<string, unknown>, name: string): T {
  const value = source[name];
  if (typeof value !== "function") throw new Error(`The selected engine package does not export ${name}.`);
  return value as T;
}
