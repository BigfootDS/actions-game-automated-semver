# Node.js, Electron and Capacitor recipes

These workflows update the `version` field in a Node.js `package.json`. They can also update any duplicate version string stored in a project-owned JSON file, such as an Electron build configuration or game metadata file.

Use `engine: nodejs` explicitly. The action does not auto-detect `package.json` files because repositories often contain a package manifest for tooling, a website, or an unrelated app alongside the game.

For every available input and output, see the [main README](../../README.md#inputs).

## Default root-project update

This is the smallest useful workflow for a Node.js game repository. It updates the root `package.json` from its existing version with a patch bump.

```yaml
name: Preview Node.js game version

on:
  workflow_dispatch:

jobs:
  update-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: game-version
        uses: BigfootDS/actions-game-automated-semver@v1
        with:
          engine: nodejs

      - run: echo "Updated to ${{ steps.game-version.outputs.version }}"
```

The update exists only in the runner after this job. Add a commit step when `package.json` should retain the version in Git.

## Electron with electron-builder

Electron Builder uses the `version` from `package.json` by default, so a normal Electron game needs no extra action input. Its `buildVersion` setting is only useful when you deliberately want different native Windows/macOS build metadata.

The following configuration keeps an explicit `package.json#build.buildVersion` aligned with the app version. `create: true` creates `buildVersion` if the `build` object already exists.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: nodejs
    bump: minor
    nodejs-version-properties: >-
      [{"filePath":"package.json","jsonPointer":"/build/buildVersion","create":true}]

- run: npm ci
- run: npm run build
- run: npm exec electron-builder -- --publish never
```

Electron Builder supports a top-level `build` object in `package.json`, and its `buildVersion` defaults to the package version when omitted. See its [configuration reference](https://www.electron.build/configuration.html) before adding a second version field that your project does not need.

## Conventional Commit versioning for an Electron game

This recipe derives the required SemVer bump from commits since the latest tag, updates `package.json`, then commits the file. It updates the explicit Electron `buildVersion` too, when your project has opted into that setting.

```yaml
name: Version Electron game

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
          engine: nodejs
          bump: ${{ steps.release-plan.outputs.bump }}
          nodejs-version-properties: >-
            [{"filePath":"package.json","jsonPointer":"/build/buildVersion","create":true}]

      - name: Commit Node.js game version
        if: ${{ steps.release-plan.outputs.bump != 'none' }}
        uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: "chore: update game version [skip ci]"
          file_pattern: package.json
```

Create an initial SemVer tag, such as `v0.0.0`, before enabling this workflow. Your release process must create the next tag after a successful build, otherwise the planner keeps comparing against the older release.

## Capacitor web-game metadata

Capacitor projects are Node.js projects, so this action can update the web app's `package.json` and any JSON metadata that the game reads at runtime. This example keeps `src/game-version.json` aligned with the package version before the web build and Capacitor sync.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: nodejs
    bump: patch
    nodejs-version-properties: >-
      [{"filePath":"src/game-version.json","jsonPointer":"/version"}]

- run: npm ci
- run: npm run build
- run: npx cap sync
```

The native Android and iOS marketing/build versions are Gradle and Xcode settings, not JSON configuration that this action rewrites. Use the action's `version` output as the input to your project’s native versioning step if those values must match:

```yaml
- run: npm run set-native-version -- "${{ steps.game-version.outputs.version }}"
```

That script is intentionally project-owned because Android and iOS version rules, build-number policies and signing processes vary between projects.

## A Node.js game in a monorepo

Set `working-directory` to the game package directory. The default Node.js version file remains `package.json` relative to that directory.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: nodejs
    working-directory: games/desktop-game
    bump: minor
```

## Preview without writing files

Set `dry-run: true` to calculate the Node.js version and validate every configured JSON property without changing the runner checkout.

```yaml
- id: game-version
  uses: BigfootDS/actions-game-automated-semver@v1
  with:
    engine: nodejs
    bump: minor
    dry-run: true

- run: |
    echo "Next version: ${{ steps.game-version.outputs.version }}"
    echo "Package manifest: ${{ steps.game-version.outputs.project-path }}"
```
