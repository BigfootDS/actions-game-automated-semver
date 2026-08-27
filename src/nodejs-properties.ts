import { readFile, writeFile } from "node:fs/promises";

type JsonObject = Record<string, unknown>;

/** A JSON string location used for an action-owned display version. */
export interface JsonStringProperty {
  filePath: string;
  jsonPointer: string;
  create?: boolean;
}

/** A JSON string location and the rendered value to write there. */
export interface JsonStringPropertyUpdate extends JsonStringProperty {
  value: string;
}

/** Reports an action-owned JSON display-version update. */
export interface UpdatedJsonStringProperty {
  filePath: string;
  jsonPointer: string;
  previousVersion?: string;
  version: string;
  changed: boolean;
}

interface JsonDocument {
  original: string;
  value: JsonObject;
  changed: boolean;
}

interface ParsedJsonPointer {
  pointer: string;
  tokens: readonly string[];
}

const unsafePropertyNames = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Reads one string from an RFC 6901 JSON Pointer without treating inherited
 * object properties as configuration. A missing final property returns
 * `undefined`; malformed documents and pointers throw useful configuration
 * errors instead.
 */
export async function readJsonStringProperty(property: JsonStringProperty): Promise<string | undefined> {
  const document = await readDocument(property.filePath);
  const pointer = parseJsonPointer(property.jsonPointer);
  const existing = getJsonPointerValue(document.value, pointer);
  if (!existing.exists) return undefined;
  if (typeof existing.value !== "string") {
    throw new Error(`${describeProperty(property)} must contain a string version.`);
  }
  return existing.value;
}

/**
 * Updates formatted display-version fields after all target files and pointers
 * have been validated. These fields deliberately live outside package metadata,
 * where applications may require a format npm would reject.
 */
export async function updateJsonStringProperties(
  properties: readonly JsonStringPropertyUpdate[],
  dryRun: boolean,
): Promise<readonly UpdatedJsonStringProperty[]> {
  const documents = new Map<string, JsonDocument>();
  const updates: UpdatedJsonStringProperty[] = [];
  const identities = new Set<string>();

  for (const property of properties) {
    if (property.value.trim().length === 0) {
      throw new Error(`${describeProperty(property)} version must not be empty.`);
    }
    const identity = `${property.filePath}\0${property.jsonPointer}`;
    if (identities.has(identity)) {
      throw new Error(`${describeProperty(property)} was configured more than once.`);
    }
    identities.add(identity);

    const document = await getDocument(documents, property.filePath);
    const pointer = parseJsonPointer(property.jsonPointer);
    const existing = getJsonPointerValue(document.value, pointer);
    if (existing.exists && typeof existing.value !== "string") {
      throw new Error(`${describeProperty(property)} must contain a string version.`);
    }
    if (!existing.exists && property.create !== true) {
      throw new Error(`${describeProperty(property)} does not exist. Pass create: true to add it.`);
    }

    const previousVersion = existing.value as string | undefined;
    const changed = previousVersion !== property.value;
    if (changed) {
      setJsonPointerValue(document.value, pointer, property.value, property.create === true);
      document.changed = true;
    }
    updates.push({
      filePath: property.filePath,
      jsonPointer: property.jsonPointer,
      ...(previousVersion === undefined ? {} : { previousVersion }),
      version: property.value,
      changed,
    });
  }

  if (!dryRun) {
    for (const [filePath, document] of documents) {
      if (document.changed) await writeFile(filePath, renderJson(document.value, document.original), "utf8");
    }
  }
  return updates;
}

async function getDocument(documents: Map<string, JsonDocument>, filePath: string): Promise<JsonDocument> {
  const existing = documents.get(filePath);
  if (existing !== undefined) return existing;
  const document = await readDocument(filePath);
  documents.set(filePath, document);
  return document;
}

async function readDocument(filePath: string): Promise<JsonDocument> {
  const original = await readFile(filePath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(original) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${JSON.stringify(filePath)} is not valid JSON: ${reason}`);
  }
  if (!isJsonObject(value)) throw new Error(`${JSON.stringify(filePath)} must contain a JSON object at its root.`);
  return { original, value, changed: false };
}

function parseJsonPointer(pointer: string): ParsedJsonPointer {
  if (pointer.length === 0 || !pointer.startsWith("/")) {
    throw new Error(`jsonPointer must start with / and identify a property; received ${JSON.stringify(pointer)}.`);
  }
  const tokens = pointer.slice(1).split("/").map((token) => decodeToken(token, pointer));
  if (tokens.some((token) => unsafePropertyNames.has(token))) {
    throw new Error(`jsonPointer must not target a prototype property; received ${JSON.stringify(pointer)}.`);
  }
  return { pointer, tokens };
}

function decodeToken(token: string, pointer: string): string {
  if (/~(?:[^01]|$)/.test(token)) throw new Error(`jsonPointer contains an invalid escape sequence: ${JSON.stringify(pointer)}.`);
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function getJsonPointerValue(value: JsonObject, pointer: ParsedJsonPointer): { exists: boolean; value?: unknown } {
  let current: JsonObject = value;
  for (let index = 0; index < pointer.tokens.length; index += 1) {
    const token = pointer.tokens[index];
    if (token === undefined) throw new Error(`jsonPointer is invalid: ${JSON.stringify(pointer.pointer)}.`);
    if (!Object.hasOwn(current, token)) return { exists: false };
    const next = current[token];
    if (index === pointer.tokens.length - 1) return { exists: true, value: next };
    if (!isJsonObject(next)) throw new Error(`jsonPointer parent is not an object: ${JSON.stringify(pointer.pointer)}.`);
    current = next;
  }
  throw new Error(`jsonPointer is invalid: ${JSON.stringify(pointer.pointer)}.`);
}

function setJsonPointerValue(value: JsonObject, pointer: ParsedJsonPointer, version: string, create: boolean): void {
  let current: JsonObject = value;
  for (let index = 0; index < pointer.tokens.length - 1; index += 1) {
    const token = pointer.tokens[index];
    if (token === undefined || !Object.hasOwn(current, token) || !isJsonObject(current[token])) {
      throw new Error(`jsonPointer parent is not an object: ${JSON.stringify(pointer.pointer)}.`);
    }
    current = current[token] as JsonObject;
  }
  const finalToken = pointer.tokens.at(-1);
  if (finalToken === undefined) throw new Error(`jsonPointer is invalid: ${JSON.stringify(pointer.pointer)}.`);
  if (!create && !Object.hasOwn(current, finalToken)) {
    throw new Error(`jsonPointer does not exist: ${JSON.stringify(pointer.pointer)}.`);
  }
  current[finalToken] = version;
}

function renderJson(value: JsonObject, original: string): string {
  const indentation = /\n([\t ]+)"(?:[^"\\]|\\.)+"\s*:/.exec(original)?.[1] ?? "  ";
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const rendered = JSON.stringify(value, undefined, indentation).replace(/\n/g, newline);
  return original.endsWith("\n") ? `${rendered}${newline}` : rendered;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeProperty(property: JsonStringProperty): string {
  return `${JSON.stringify(property.filePath)} at ${JSON.stringify(property.jsonPointer)}`;
}
