export type Engine = "godot" | "unity" | "unreal";
export type RequestedEngine = Engine | "auto";
export type Bump = "major" | "minor" | "patch" | "quad" | "none";

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
