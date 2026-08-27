export type Engine = "godot" | "nodejs" | "unity" | "unreal";
export type RequestedEngine = Engine | "auto";
export type Bump = "major" | "minor" | "patch" | "quad" | "none";

/** Describes one extra JSON version string that a Node.js project keeps in sync with package.json. */
export interface NodejsVersionProperty {
  /** JSON file path, relative to the action's working directory. */
  filePath: string;
  /** RFC 6901 JSON Pointer for the string property to update. */
  jsonPointer: string;
  /** Allow creation of the final property when its parent object already exists. */
  create?: boolean;
}

export interface ActionOptions {
  engine: RequestedEngine;
  workingDirectory: string;
  projectPath?: string;
  version?: string;
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
