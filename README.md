# Game Automated SemVer

Configurable GitHub Action for updating Godot, Node.js, Unity, and Unreal project versions. It calculates the next version, then uses the matching BigfootDS updater bundled into the action to make the project-specific file change.

The action never creates commits, tags, or releases in the consuming repository. How you preserve and use the semver version string made by this action is up to you. 

## Requirements

Make sure you check out your game repo before using this action!

## Basic usage

With no version supplied, the action reads the current project version and applies a patch bump:

```yaml
name: Update game version

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: game-version
        uses: BigfootDS/actions-game-automated-semver@v1
        with:
          engine: auto
          bump: patch

      - run: echo "Updated to ${{ steps.game-version.outputs.version }}"

```

Use an immutable action tag or commit SHA in production. The `v1` tag tracks the latest compatible v1 release.

To commit the change, stage the resolved `project-path` for your chosen engine, then commit and push it using the credentials and release policy that suit your repository.

## Engine recipes

The engine-specific recipe pages contain copy-and-paste workflows for the common project layouts and release flows:

- [Godot recipes](https://github.com/BigfootDS/actions-game-automated-semver/blob/main/docs/examples/Godot.md)
- [Node.js, Electron and Capacitor recipes](https://github.com/BigfootDS/actions-game-automated-semver/blob/main/docs/examples/Nodejs.md)
- [Unity recipes](https://github.com/BigfootDS/actions-game-automated-semver/blob/main/docs/examples/Unity.md)
- [Unreal recipes](https://github.com/BigfootDS/actions-game-automated-semver/blob/main/docs/examples/Unreal.md)

You can read on for common usages below, too.

## Automatic versioning from Conventional Commits

For a hands-off Unity versioning workflow, use [`ietf-tools/semver-conventional-commits`](https://github.com/ietf-tools/semver-conventional-commits) to determine the bump since the latest release tag, then pass its `bump` output to this action. [`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action) can commit the updated settings file without a custom shell step.

```yaml
name: Update Unity project version

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  update-version:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: true

      - id: release-plan
        uses: ietf-tools/semver-conventional-commits@v1.11.0
        with:
          token: ${{ github.token }}
          branch: main
          noNewCommitBehavior: current
          noVersionBumpBehavior: current

      - id: game-version
        uses: BigfootDS/actions-game-automated-semver@v1
        with:
          engine: unity
          bump: ${{ steps.release-plan.outputs.bump }}

      - name: Commit Unity version update
        if: ${{ steps.release-plan.outputs.bump != 'none' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update game version"
          file_pattern: ProjectSettings/ProjectSettings.asset
```

The planner's `bump` output is `major`, `minor`, `patch`, or `none`. Its default Conventional Commit mapping treats breaking changes as major releases, `feat` as minor releases, and common maintenance types as patch releases. Use the planner's inputs to adjust those mappings for your repository.

Create an initial SemVer tag, such as `v0.0.0`, before enabling this workflow. The planner compares against the latest tag, so a subsequent release step must tag the version after a successful build to establish the next comparison point.

## Engines and project discovery

`engine: auto` recursively searches up to five directories below `working-directory` for exactly one of these standard game-project settings files:

| Engine | Default settings file |
| --- | --- |
| Godot | `project.godot` |
| Unity | `ProjectSettings/ProjectSettings.asset` |
| Unreal | `Config/DefaultGame.ini` |

Use `engine: nodejs` for Node.js projects. A repository may have a `package.json` for tools, a website, or an Electron game, so `auto` deliberately does not search for package manifests. It can infer Node.js only when `project-path` explicitly points to a `package.json`.

Set both `engine` and `project-path` for monorepos, non-standard layouts, or when more than one project is present:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    project-path: games/space-game/Config/DefaultGame.ini
    bump: minor
```

## Version control

`version` takes precedence over `bump`, so it is useful when a release pipeline has already calculated the version:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    version: ${{ steps.release-plan.outputs.version }}
    strip-leading-v: true
```

Supported `bump` values are `major`, `minor`, `patch`, and `none`; `quad` is also available for Unity. A numeric bump clears existing prerelease/build labels before any supplied labels are applied. Set `release-label` and `build-label` to add strict SemVer metadata:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    bump: none
    release-label: rc.1
    build-label: build.42
```

Versions are strict SemVer by default. Use `allow-non-semver: true` only with an exact `version` input for Godot, Node.js, or Unreal; numeric bumps and labels require SemVer. Unity's updater needs a parseable semantic version to render its PlayerSettings fields.

## Engine-specific options

For Node.js, `nodejs-version-properties` is a JSON array of extra JSON version strings to keep aligned with `package.json`. Each item has a `filePath` relative to `working-directory`, an [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) in `jsonPointer`, and an optional `create: true` flag for a missing final property.

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: nodejs
    bump: patch
    nodejs-version-properties: >-
      [{"filePath":"game-version.json","jsonPointer":"/version"},{"filePath":"package.json","jsonPointer":"/build/buildVersion","create":true}]
```

This keeps the package version and project-owned JSON metadata together. The Node.js updater intentionally does not edit JavaScript, TypeScript, YAML, Gradle, plist, XML or Xcode project files. The [Node.js recipes](https://github.com/BigfootDS/actions-game-automated-semver/blob/main/docs/examples/Nodejs.md) show Electron and Capacitor-friendly patterns.

For Unreal, set a different INI destination when the version is not in the standard General Project Settings section:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    unreal-section: Build
    unreal-key: Version
    version: 1.2.3
```

For Unity, `unity-version-properties` is a JSON map of PlayerSettings properties to format strings. Supported placeholders include `{major}`, `{minor}`, `{patch}`, `{quad}`, `{build}`, `{revision}`, `{releaseLabel}`, and `{buildLabel}`.

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: patch
    unity-quad: 17
    unity-version-properties: >-
      {"bundleVersion":"{major}.{minor}.{patch}","metroPackageVersion":"{major}.{minor}.{patch}.{quad}"}
```

`dry-run: true` calculates the result without modifying a project file. The Unity adapter performs its dry run in a temporary copy so it has the same change detection as a real write.

## Migrating from UnityAutomatedSemver

The previous Unity-only action used separate inputs for each PlayerSettings property. This action uses the shared engine input model and one JSON map for Unity version properties.

| UnityAutomatedSemver | This action |
| --- | --- |
| `updateMode` | `bump`; use `none` instead of `no-bump`. |
| `projectSettingsPath` | `engine: unity` with `project-path`. |
| `releaseLabel` / `buildLabel` | `release-label` / `build-label`. |
| `bundleVersion` and per-platform format inputs | `unity-version-properties` JSON map. |
| `useBundleVersionForAll` | Assign the same format to each relevant property in `unity-version-properties`. |
| Component override inputs | Supply the exact `version`, plus `unity-quad` for a fourth component when needed. |
| `semver-string` / `semver-full-data` outputs | `version` / `full-data` outputs. |
| `backupAssetFile` | No direct replacement; use Git history or `dry-run: true` before changing the file. |

### Pre-release or nightly Unity builds

This is the equivalent of the old action's `no-bump`, release-label, build-label, and `bundleVersion` example:

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: none
    release-label: rc1
    build-label: nightly
    unity-version-properties: >-
      {"bundleVersion":"{major}.{minor}.{patch}-{releaseLabel}+{buildLabel}"}
```

### Multi-platform Unity version strings

Replace the old individual Unity format inputs with a single JSON map. Include only the PlayerSettings properties your project needs:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: patch
    unity-version-properties: >-
      {"bundleVersion":"{major}.{minor}.{patch}","switchDisplayVersion":"{major}.{minor}.{patch}","ps4MasterVersion":"{major}.{minor}","ps4AppVersion":"{major}.{minor}","metroPackageVersion":"{major}.{minor}.{patch}.{quad}","XboxOneVersion":"{major}.{minor}.{patch}.{quad}","psp2MasterVersion":"{major}.{minor}","psp2AppVersion":"{major}.{minor}"}
```

### Sparse checkout for large Unity projects

Only `ProjectSettings/ProjectSettings.asset` is required to update a Unity version, so a sparse checkout remains a useful way to keep the workflow light:

```yaml
- uses: actions/checkout@v7
  with:
    sparse-checkout: ProjectSettings

- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    project-path: ProjectSettings/ProjectSettings.asset
```

## Bundled engine updaters

The action bundle includes these exact updater releases:

- `@bigfootds/godot-semver-updater@0.0.2`
- `@bigfootds/nodejs-semver-updater@0.0.1`
- `@bigfootds/unity-semver-updater@0.0.7`
- `@bigfootds/unreal-semver-updater@0.0.2`

They are installed only while this action itself is developed and bundled into its committed `dist/index.js` file. So, while this action calls on those three NPM packages, it does not reach out to NPM or do any downloads or installs. The packages are bundled into this action by the time you use this action!

## Inputs

All inputs are optional. `version` takes precedence over `bump` when both are supplied.

| Input | Default | Description |
| --- | --- | --- |
| `engine` | `auto` | Project type to update: `auto`, `godot`, `nodejs`, `unity`, or `unreal`. |
| `working-directory` | `.` | Directory containing the game or Node.js project. |
| `project-path` | — | Version-file path relative to `working-directory`; auto-detected when omitted. |
| `version` | — | Exact version to write. |
| `bump` | `patch` | Version component to increment: `major`, `minor`, `patch`, `quad` (Unity only), or `none`. |
| `release-label` | — | SemVer prerelease label, such as `rc.1`. |
| `build-label` | — | SemVer build label, such as `build.42`. |
| `strip-leading-v` | `false` | Removes one leading `v` from `version`. |
| `allow-non-semver` | `false` | Allows an exact non-SemVer `version` for Godot, Node.js, or Unreal. |
| `dry-run` | `false` | Calculates the update without writing the settings file. |
| `unreal-section` | `/Script/EngineSettings.GeneralProjectSettings` | Unreal INI section containing the version. |
| `unreal-key` | `ProjectVersion` | Unreal INI key containing the version. |
| `unity-version-properties` | `{"bundleVersion":"{major}.{minor}.{patch}"}` | JSON map of Unity PlayerSettings properties to version format strings. |
| `unity-quad` | — | Optional non-negative fourth version component for Unity formats. |
| `unity-treat-build-as-patch` | `true` | Couples Unity's numeric build and patch values. |
| `unity-treat-revision-as-quad` | `true` | Couples Unity's numeric revision and quad values. |
| `nodejs-version-properties` | `[]` | JSON array of additional Node.js JSON version properties with `filePath`, `jsonPointer`, and optional `create`. |

## Outputs

| Output | Description |
| --- | --- |
| `version` | Version written or calculated. |
| `previous-version` | Existing version, when one was found. |
| `changed` | Whether the settings file changed or would change. |
| `engine` | Resolved engine. |
| `project-path` | Resolved settings-file path. |
| `full-data` | JSON containing engine-specific version data and rendered Unity properties. |

## Action compatibility

### GameCI Unity Builder

GameCI's `Semantic` versioning strategy independently calculates a build version from Git history. When this action manages a Unity project's `ProjectSettings.asset`, use one system as the owner of the effective build version rather than enabling both strategies.

To use the version stored by this action, run GameCI after the version-update step and disable GameCI versioning:

```yaml
- uses: game-ci/unity-builder@v4
  with:
    versioning: None
```

Alternatively, give GameCI the same version explicitly. This is useful when you want the version written to `ProjectSettings.asset` and the version applied during the build to be visibly coupled:

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: patch

- uses: game-ci/unity-builder@v4
  with:
    versioning: Custom
    version: ${{ steps.game-version.outputs.version }}
```

Do not use GameCI's `Semantic` strategy alongside this action when you expect the project-file version and effective build version to match. See the [GameCI Builder versioning documentation](https://game.ci/docs/github/builder/) for its available strategies.

## Development

```sh
npm ci
npm test
npm run build
git diff --exit-code -- dist
```

`dist/` is committed because GitHub Actions executes the bundled JavaScript, not the TypeScript source.

## Releasing this action

The `CD` workflow releases every Conventional Commit pushed to `main`. Breaking changes create a major release, `feat` commits create a minor release, and other Conventional Commit types create a patch release. CD runs the test suite and verifies that `dist/` is current before it changes anything.

CD owns the `package.json` and `package-lock.json` versions. It commits their release version, creates the matching immutable `vX.Y.Z` tag and GitHub Release, then force-updates the floating major tag such as `v1`. The action's source version and its Marketplace release therefore remain aligned.
