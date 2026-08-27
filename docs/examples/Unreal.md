# Unreal recipes

These workflows update the `ProjectVersion` value in Unreal's `Config/DefaultGame.ini`. By default, the action looks in `/Script/EngineSettings.GeneralProjectSettings`.

The action changes the checked-out INI file only. Add a commit step if the repository should retain that version, or use the output for a build that does not write back to Git.

For every available input and output, see the [main README](../../README.md#inputs).

## Default root-project update

This is the smallest useful workflow for a repository containing one Unreal project. There is no `with` block: the action discovers `Config/DefaultGame.ini` below the repository root and applies a patch bump to the default Unreal setting.

```yaml
name: Preview Unreal version

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

The changed file disappears with the runner at the end of the job. Commit it explicitly if that is part of your project's versioning policy.

## Automatic versioning from Conventional Commits

This recipe uses [`ietf-tools/semver-conventional-commits`](https://github.com/ietf-tools/semver-conventional-commits) to determine the biggest required bump since the latest tag. It updates `DefaultGame.ini` and commits that one file when a bump is needed.

```yaml
name: Version Unreal project

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
          engine: unreal
          bump: ${{ steps.release-plan.outputs.bump }}

      - name: Commit Unreal version
        if: ${{ steps.release-plan.outputs.bump != 'none' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update Unreal project version [skip ci]"
          file_pattern: Config/DefaultGame.ini
```

Create an initial tag such as `v0.0.0` before enabling this workflow. Create the next release tag after a successful build, or the version planner will continue to compare with the previous release.

If branch protection prevents GitHub Actions from pushing to `main`, run the write-back step through the branch or pull request process your repository already uses.

## A project in a monorepo

Set `working-directory` to the project directory and keep `project-path` relative to it. This prevents an unrelated Godot or Unity project elsewhere in the repository from making automatic discovery ambiguous.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    working-directory: games/space-game
    project-path: Config/DefaultGame.ini
    bump: minor
```

## A custom INI section and key

Some projects store their version outside Unreal's default Engine Settings section. Point the action at the real section and key, then set an exact version when another release tool is the source of truth.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    unreal-section: Build
    unreal-key: Version
    version: 1.2.3
```

If an external platform requires a non-SemVer value, such as a four-part numeric version, pass it as an exact `version` and opt in explicitly:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    version: 1.2.3.45
    allow-non-semver: true
```

## Preview the next version

`dry-run: true` performs the same parsing and calculates the same outputs without modifying `DefaultGame.ini`. This is useful for a pull request check or a build that only needs a version string.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: unreal
    bump: minor
    dry-run: true

- run: |
    echo "Next version: ${{ steps.game-version.outputs.version }}"
    echo "Settings file: ${{ steps.game-version.outputs.project-path }}"
```
