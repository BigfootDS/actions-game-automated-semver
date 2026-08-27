export type Engine = "godot" | "nodejs" | "unity" | "unreal";
export type RequestedEngine = Engine | "auto";
export type Bump = "major" | "minor" | "patch" | "quad" | "none";

/** Describes one extra JSON version string that a Node.js project keeps in sync with package.json. */
export interface NodejsVersionProperty {
  /** JSON file path, relative to the action's working directory. */
  filePath: string;
  /** RFC 6901 JSON Pointer for the string property to update. */
  jsonPointer: string;
  /** Optional literal version template for this property. */
  format?: string;
  /** Allow creation of the final property when its parent object already exists. */
  create?: boolean;
}

/** Identifies a formatted Node.js display version to use as the action's source of truth. */
export interface NodejsVersionSource {
  /** JSON file path, relative to the action's working directory. */
  filePath: string;
  /** RFC 6901 JSON Pointer for the display-version string. */
  jsonPointer: string;
  /** Allow creation when an exact version input supplies the initial value. */
  create?: boolean;
}

export interface ActionOptions {
  engine: RequestedEngine;
  workingDirectory: string;
  projectPath?: string;
  version?: string;
  /** Literal template used to parse and render an engine's primary display version. */
  versionFormat?: string;
  bump: Bump;
  releaseLabel?: string;
  buildLabel?: string;
  dryRun: boolean;
  allowNonSemver: boolean;
  stripLeadingV: boolean;
  unrealSection: string;
  unrealKey: string;
  unityVersionProperties: Record<string, string>;
  unityQuad?: number;
  unityTreatBuildAsPatch: boolean;
  unityTreatRevisionAsQuad: boolean;
  nodejsVersionProperties: readonly NodejsVersionProperty[];
  nodejsVersionSource?: NodejsVersionSource;
}

export interface ResolvedProject {
  engine: Engine;
  projectPath: string;
}

export interface UpdateResult {
  engine: Engine;
  projectPath: string;
  previousVersion?: string;
  version: string;
  changed: boolean;
  fullData: Record<string, unknown>;
}
