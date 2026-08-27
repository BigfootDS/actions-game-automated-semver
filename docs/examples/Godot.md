# Godot recipes

These workflows update the `config/version` value in a Godot `project.godot` file. They assume the Godot project is at the repository root unless a recipe says otherwise.

The action changes the checked-out file only. If you want that version to live in Git, add a commit step after the action. That is a deliberate separation, because each project can keep its own review, build, and release rules.

For every available input and output, see the [main README](../../README.md#inputs).

## Default root-project update

This is the smallest useful workflow. There is no `with` block, so the action auto-detects the one project settings file below the repository root and applies a patch bump. For a root Godot project, that file is `project.godot`.

```yaml
name: Preview Godot version

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

This writes to the runner's checkout, then the runner is discarded. Use this recipe when another step consumes the version during the same job, or add the next commit step when the file should persist in the repository.

## Default update, committed back to the repository

This keeps the default action inputs, then commits `project.godot` only when its content changed. `contents: write` is required because the commit action pushes to the repository.

```yaml
name: Update Godot version

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

      - name: Commit Godot version
        if: ${{ steps.game-version.outputs.changed == 'true' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update Godot project version [skip ci]"
          file_pattern: project.godot
```

`[skip ci]` prevents the version-only commit from starting this workflow again on repositories that honour [GitHub's skip instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Automatic versioning from Conventional Commits

This recipe uses [`ietf-tools/semver-conventional-commits`](https://github.com/ietf-tools/semver-conventional-commits) to calculate the bump since the last release tag. It then passes that bump straight to this action and commits the updated Godot settings file.

```yaml
name: Version Godot project

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
          engine: godot
          bump: ${{ steps.release-plan.outputs.bump }}

      - name: Commit Godot version
        if: ${{ steps.release-plan.outputs.bump != 'none' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update Godot project version [skip ci]"
          file_pattern: project.godot
```

Create an initial tag such as `v0.0.0` before enabling this workflow. Your release process must create the next tag after a successful build, otherwise the planner will continue comparing against an older release.

If branch protection prevents GitHub Actions from pushing to `main`, run the write-back step through the branch or pull request process your repository already uses.

## Pre-release and build labels

Use `bump: none` when the numeric version is already correct and you only need SemVer metadata. This is handy for a release candidate or an automated nightly build.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    bump: none
    release-label: rc.1
    build-label: nightly.${{ github.run_number }}
```

For example, a project at `1.4.0` becomes `1.4.0-rc.1+nightly.42`. The `version` output contains the complete value.

## Literal display versions

Godot accepts any string in `config/version`, while the action still needs a strict SemVer value to calculate bumps. `version-format` keeps those jobs separate. All text outside placeholders is literal, so this format is deliberately written with a space and a hyphen:

```yaml
- uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    bump: patch
    version-format: "Release {major}.{minor}.{patch} - beta"
```

`Release 1.0.0 - beta` becomes `Release 1.0.1 - beta`. The action output remains `1.0.1`, which is the value to use for a Git tag or release.

## Preview a change without writing a file

Set `dry-run` when you want to print the version and resolved project path without modifying `project.godot`.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: godot
    bump: minor
    dry-run: true

- run: |
    echo "Next version: ${{ steps.game-version.outputs.version }}"
    echo "Settings file: ${{ steps.game-version.outputs.project-path }}"
```
