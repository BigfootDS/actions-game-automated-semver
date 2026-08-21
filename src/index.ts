import * as core from "@actions/core";
import { readInputs } from "./inputs.js";
import { updateProject } from "./update.js";

async function run(): Promise<void> {
  const options = readInputs(core);
  const result = await updateProject(options);
  core.setOutput("version", result.version);
  core.setOutput("previous-version", result.previousVersion ?? "");
  core.setOutput("changed", String(result.changed));
  core.setOutput("engine", result.engine);
  core.setOutput("project-path", result.projectPath);
  core.setOutput("full-data", JSON.stringify(result.fullData));
  core.info(
    `${options.dryRun ? "Would update" : "Updated"} ${result.engine} project at ${result.projectPath}: ${result.previousVersion ?? "(unset)"} -> ${result.version}${result.changed ? "" : " (unchanged)"}`,
  );
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
