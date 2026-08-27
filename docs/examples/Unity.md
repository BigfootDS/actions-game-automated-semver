# Unity recipes

These workflows update Unity's `ProjectSettings/ProjectSettings.asset`. The default Unity format changes `bundleVersion` to `{major}.{minor}.{patch}`.

The action does not commit the changed project file. Keep that step in the consuming workflow, where it can happen after a build, review gate, or other project-specific check.

For every available input and output, see the [main README](../../README.md#inputs). Users moving from the older Unity-only action should also read its [migration guide](../../README.md#migrating-from-unityautomatedsemver).

## Default root-project update

This is the smallest useful workflow for a repository containing one Unity project at its root. There is no `with` block: the action finds `ProjectSettings/ProjectSettings.asset`, reads the existing version, and applies the default patch bump.

```yaml
name: Preview Unity version

on:
  workflow_dispatch:

jobs:
  update-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: game-version
        uses: BigfootDS/actions-game-automated-semver@v1

      - run: echo "Updated to ${{ steps.game-version.outputs.version }}"
```

The edit exists only in the runner after this job. Add a commit step when `ProjectSettings.asset` should be kept at the new version in Git.

## Automatic versioning from Conventional Commits

This recipe calculates a version bump from commits since the latest release tag, writes it to Unity's project settings, then commits that settings file. The planner treats breaking changes as major, `feat` as minor, and common maintenance commits as patch releases by default.

```yaml
name: Version Unity project

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

      - name: Commit Unity version
        if: ${{ steps.release-plan.outputs.bump != 'none' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update Unity project version [skip ci]"
          file_pattern: ProjectSettings/ProjectSettings.asset
```

Create an initial SemVer tag, such as `v0.0.0`, before enabling this workflow. Your later release step must create the next tag after a successful build, otherwise the planner will keep comparing against an old release.

If branch protection prevents GitHub Actions from pushing to `main`, run the write-back step through the branch or pull request process your repository already uses.

## Pass the calculated version to GameCI Unity Builder

When GameCI builds the same project, let this action own the project-file version and pass its output into GameCI's `Custom` versioning strategy. This keeps the version in `ProjectSettings.asset` and the effective build version together.

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

Do not also use GameCI's `Semantic` strategy when the two versions need to match. It calculates its own build version from Git history. See the [GameCI Builder versioning documentation](https://game.ci/docs/github/builder/) for its available options.

## Release candidates and nightly builds

This replaces a normal three-part `bundleVersion` with a SemVer pre-release and build value. `bump: none` keeps the numeric part unchanged.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: none
    release-label: rc.1
    build-label: nightly.${{ github.run_number }}
    unity-version-properties: >-
      {"bundleVersion":"{major}.{minor}.{patch}-{releaseLabel}+{buildLabel}"}
```

## Multi-platform PlayerSettings versions

`unity-version-properties` is a JSON map. Include the formats that matter to the platforms you build for, rather than adding values for every Unity target just because they exist.

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    bump: patch
    unity-quad: 17
    unity-version-properties: >-
      {"bundleVersion":"{major}.{minor}.{patch}","metroPackageVersion":"{major}.{minor}.{patch}.{quad}","XboxOneVersion":"{major}.{minor}.{patch}.{quad}"}
```

## Sparse checkout for a large repository

Only `ProjectSettings/ProjectSettings.asset` is needed for a version update. This is useful when a Unity repository is large and the workflow does not need `Assets/` or package content.

```yaml
- uses: actions/checkout@v7
  with:
    sparse-checkout: ProjectSettings

- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unity
    project-path: ProjectSettings/ProjectSettings.asset
```
