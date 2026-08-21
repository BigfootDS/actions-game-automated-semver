import type { Bump } from "./types.js";

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const numericIdentifier = "(?:0|[1-9]\\d*)";
const prereleaseIdentifier = `(?:${numericIdentifier}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const prerelease = `(?<prerelease>-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?`;
const build = "(?<build>\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";
const versionPattern = new RegExp(
  `^(?<major>${numericIdentifier})\\.(?<minor>${numericIdentifier})\\.(?<patch>${numericIdentifier})${prerelease}${build}$`,
);

export function parseSemanticVersion(version: string): SemanticVersion {
  const match = versionPattern.exec(version);
  if (match?.groups === undefined) {
    throw new Error(`Expected a valid semantic version, received ${JSON.stringify(version)}.`);
  }
  const major = Number.parseInt(match.groups.major ?? "", 10);
  const minor = Number.parseInt(match.groups.minor ?? "", 10);
  const patch = Number.parseInt(match.groups.patch ?? "", 10);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error(`Version components must be safe integers; received ${JSON.stringify(version)}.`);
  }
  return {
    major,
    minor,
    patch,
    ...(match.groups.prerelease === undefined ? {} : { prerelease: match.groups.prerelease.slice(1) }),
    ...(match.groups.build === undefined ? {} : { build: match.groups.build.slice(1) }),
  };
}

export function formatSemanticVersion(version: SemanticVersion): string {
  const output = `${version.major}.${version.minor}.${version.patch}`;
  return `${output}${version.prerelease === undefined ? "" : `-${version.prerelease}`}${version.build === undefined ? "" : `+${version.build}`}`;
}

export function bumpSemanticVersion(version: SemanticVersion, bump: Exclude<Bump, "quad">): SemanticVersion {
  switch (bump) {
    case "major": return { major: version.major + 1, minor: 0, patch: 0 };
    case "minor": return { major: version.major, minor: version.minor + 1, patch: 0 };
    case "patch": return { major: version.major, minor: version.minor, patch: version.patch + 1 };
    case "none": return { ...version };
  }
}

export function applyLabels(
  version: SemanticVersion,
  releaseLabel: string | undefined,
  buildLabel: string | undefined,
): SemanticVersion {
  const withLabels: SemanticVersion = {
    ...version,
    ...(releaseLabel === undefined || releaseLabel.length === 0 ? {} : { prerelease: releaseLabel }),
    ...(buildLabel === undefined || buildLabel.length === 0 ? {} : { build: buildLabel }),
  };
  parseSemanticVersion(formatSemanticVersion(withLabels));
  return withLabels;
}
