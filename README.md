# Game Automated SemVer

Configurable GitHub Action for updating Godot, Unity, and Unreal project versions. It calculates the next version, then installs the matching BigfootDS engine updater in an isolated temporary directory to make the engine-specific file change.

The action never creates commits, tags, or releases in the consuming repository. This keeps it composable: decide your release policy in the workflow, then commit the changed project setting only when you intend to.

## Requirements

- A checked-out game project.
- An npm-capable runner with registry access. GitHub-hosted runners meet this requirement.
- The selected engine updater package must be available on npm. Default adapters are pinned to known package versions and can be overridden.

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
      - uses: actions/checkout@v6

      - id: game-version
        uses: BigfootDS/actions-game-automated-semver@v1
        with:
          engine: auto
          bump: patch

      - run: echo "Updated to ${{ steps.game-version.outputs.version }}"

```

Use an immutable action tag or commit SHA in production. The `v1` tag will be created when the action has its first major release.

To commit the change, stage the resolved `project-path` for your chosen engine, then commit and push it using the credentials and release policy that suit your repository.

## Engines and project discovery

`engine: auto` recursively searches up to five directories below `working-directory` for exactly one of these standard settings files:

| Engine | Default settings file |
| --- | --- |
| Godot | `project.godot` |
| Unity | `ProjectSettings/ProjectSettings.asset` |
| Unreal | `Config/DefaultGame.ini` |

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

Versions are strict SemVer by default. Use `allow-non-semver: true` only with an exact `version` input for Godot or Unreal; numeric bumps and labels require SemVer. Unity's updater needs a parseable semantic version to render its PlayerSettings fields.

## Engine-specific options

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

## Adapter overrides

The default pinned adapters are:

- `@bigfootds/godot-semver-updater@0.0.2`
- `@bigfootds/unity-semver-updater@0.0.7`
- `@bigfootds/unreal-semver-updater@0.0.1`

Override either part when testing a newer updater or using a compatible private fork:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    engine-package: @acme/godot-version-adapter
    engine-package-version: 2.1.0
```

Custom adapters must export the same engine-specific API as the corresponding BigfootDS updater.

## Outputs

| Output | Description |
| --- | --- |
| `version` | Version written or calculated. |
| `previous-version` | Existing version, when one was found. |
| `changed` | Whether the settings file changed or would change. |
| `engine` | Resolved engine. |
| `project-path` | Resolved settings-file path. |
| `full-data` | JSON containing engine-specific version data and rendered Unity properties. |

## Development

```sh
npm ci
npm test
npm run build
git diff --exit-code -- dist
```

`dist/` is committed because GitHub Actions executes the bundled JavaScript, not the TypeScript source.
