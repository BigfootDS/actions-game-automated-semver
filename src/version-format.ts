/** Values that can be embedded in a literal project-version format. */
export interface VersionFormatValues {
  major: number;
  minor: number;
  patch: number;
  quad?: number;
  build?: number;
  revision?: number;
  releaseLabel?: string;
  buildLabel?: string;
}

const supportedPlaceholders = new Set([
  "major",
  "minor",
  "patch",
  "quad",
  "build",
  "revision",
  "releaseLabel",
  "buildLabel",
]);
const requiredPlaceholders = ["major", "minor", "patch"] as const;
const placeholderPattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const numericPattern = "(?:0|[1-9]\\d*)";
const prereleaseIdentifier = `(?:${numericPattern}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const placeholderMatchers: Readonly<Record<string, string>> = {
  major: numericPattern,
  minor: numericPattern,
  patch: numericPattern,
  quad: numericPattern,
  build: numericPattern,
  revision: numericPattern,
  releaseLabel: `${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*`,
  buildLabel: "[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*",
};

/** The conventional three-part version format used when no custom format is supplied. */
export const defaultVersionFormat = "{major}.{minor}.{patch}";

/**
 * Renders a project-facing version string from a safe literal template.
 *
 * Text outside recognised placeholders is copied exactly. This deliberately
 * makes separators, prefixes, suffixes, spaces, and punctuation configuration
 * data rather than regular-expression or JavaScript syntax.
 */
export function formatVersion(values: VersionFormatValues, format: string): string {
  validateVersionFormat(format);
  const replacements: Readonly<Record<string, string>> = {
    major: String(values.major),
    minor: String(values.minor),
    patch: String(values.patch),
    quad: String(values.quad ?? 0),
    build: String(values.build ?? values.patch),
    revision: String(values.revision ?? values.quad ?? 0),
    releaseLabel: values.releaseLabel ?? "",
    buildLabel: values.buildLabel ?? "",
  };
  return format.replace(placeholderPattern, (_placeholder, name: string) => replacements[name] ?? "");
}

/**
 * Reads numeric SemVer components and optional labels from a project-facing
 * display value. The value must match the complete template, which prevents a
 * similar-looking version elsewhere in a settings file becoming the source.
 *
 * @throws When the template is malformed, does not contain the three core
 * version components, or the value does not exactly match it.
 */
export function parseVersionFormat(value: string, format: string): VersionFormatValues {
  const matcher = compileVersionFormat(format);
  const match = matcher.exec(value);
  if (match?.groups === undefined) {
    throw new Error(`Version ${JSON.stringify(value)} does not match version-format ${JSON.stringify(format)}.`);
  }

  return {
    major: parseNumericComponent(match.groups.major, "major", value),
    minor: parseNumericComponent(match.groups.minor, "minor", value),
    patch: parseNumericComponent(match.groups.patch, "patch", value),
    ...(match.groups.quad === undefined ? {} : { quad: parseNumericComponent(match.groups.quad, "quad", value) }),
    ...(match.groups.build === undefined ? {} : { build: parseNumericComponent(match.groups.build, "build", value) }),
    ...(match.groups.revision === undefined
      ? {}
      : { revision: parseNumericComponent(match.groups.revision, "revision", value) }),
    ...(match.groups.releaseLabel === undefined ? {} : { releaseLabel: match.groups.releaseLabel }),
    ...(match.groups.buildLabel === undefined ? {} : { buildLabel: match.groups.buildLabel }),
  };
}

/** Validates a template before it is used for either formatting or parsing. */
export function validateVersionFormat(format: string): void {
  if (format.length === 0) throw new Error("version-format must not be empty.");

  const counts = new Map<string, number>();
  for (const match of format.matchAll(placeholderPattern)) {
    const name = match[1];
    if (name === undefined || !supportedPlaceholders.has(name)) {
      throw new Error(`version-format contains unsupported placeholder ${JSON.stringify(match[0])}.`);
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const unknownPlaceholder = /\{[^{}]*\}/.exec(format.replace(placeholderPattern, ""));
  if (unknownPlaceholder !== null) {
    throw new Error(`version-format contains unsupported placeholder ${JSON.stringify(unknownPlaceholder[0])}.`);
  }

  for (const [name, count] of counts) {
    if (count > 1) throw new Error(`version-format must not repeat ${JSON.stringify(`{${name}}`)}.`);
  }
  for (const name of requiredPlaceholders) {
    if (counts.get(name) !== 1) {
      throw new Error(`version-format must contain ${JSON.stringify(`{${name}}`)} exactly once.`);
    }
  }
}

function compileVersionFormat(format: string): RegExp {
  validateVersionFormat(format);
  let source = "^";
  let lastIndex = 0;

  for (const match of format.matchAll(placeholderPattern)) {
    const name = match[1];
    if (name === undefined || match.index === undefined) continue;
    const matcher = placeholderMatchers[name];
    if (matcher === undefined) continue;
    source += escapeRegex(format.slice(lastIndex, match.index));
    source += `(?<${name}>${matcher})`;
    lastIndex = match.index + match[0].length;
  }

  source += `${escapeRegex(format.slice(lastIndex))}$`;
  return new RegExp(source);
}

function parseNumericComponent(value: string | undefined, name: string, fullVersion: string): number {
  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
    throw new Error(`Version ${JSON.stringify(fullVersion)} has an invalid ${name} component.`);
  }
  return numericValue;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
