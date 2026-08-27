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

The native Android and iOS marketing/build versions are Gradle and Xcode settings, not JSON configuration that this action rewrites. `npx cap sync` copies web assets and synchronises native dependencies, but it does not set those release-version values. Use one of these explicit native-version steps after the Capacitor sync.

### Option 1: `@capawesome/capver` (newer)

[`@capawesome/capver`](https://www.npmjs.com/package/@capawesome/capver) synchronises the Node.js package version, Android version name/code and iOS version/build number. Pin it because it is a newer, pre-1.0 tool, then run its check command in the workflow so a changed project layout is caught early.

```yaml
- name: Set Capacitor native versions with capver
  run: npx --yes @capawesome/capver@0.1.5 set "${{ steps.game-version.outputs.version }}"

- name: Verify Capacitor versions with capver
  run: npx --yes @capawesome/capver@0.1.5 get
```

`capver set` accepts a plain `major.minor.patch` release version. Do not use this option for a SemVer pre-release or build label such as `1.2.3-rc.1`.

### Option 2: `capacitor-set-version` (older)

[`capacitor-set-version`](https://www.npmjs.com/package/capacitor-set-version) is an older alternative that writes the native version and an explicit integer build number. GitHub’s run number gives each workflow run a monotonically increasing build number, which is useful for Android store uploads.

```yaml
- name: Set Capacitor native versions with capacitor-set-version
  run: >-
    npm exec --yes --package=capacitor-set-version@2.2.0 --
    capacitor-set-version .
    -v "${{ steps.game-version.outputs.version }}"
    -b "${{ github.run_number }}"
```

This package is less current than `capver`, so treat it as a compatibility option for an existing project rather than the default for a new one. Both commands modify native files, so include their changed Android and iOS files in any commit step that writes versions back to Git.

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
