import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/** Installs the requested engine adapter in an isolated temporary directory. */
export async function withEnginePackage<T>(
  packageName: string,
  packageSpec: string,
  callback: (enginePackage: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "game-semver-action-"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    await execFile(npm, [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      directory,
      packageSpec,
    ]);
    const entrypoint = pathToFileURL(join(directory, "node_modules", packageName, "dist", "index.js")).href;
    const dynamicImport = new Function("url", "return import(url);") as (url: string) => Promise<Record<string, unknown>>;
    const enginePackage = await dynamicImport(entrypoint);
    return await callback(enginePackage);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
