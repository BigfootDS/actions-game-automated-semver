const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyLabels,
  bumpSemanticVersion,
  formatSemanticVersion,
  parseSemanticVersion,
} = require("../lib/semver.js");

test("parses, bumps, and formats strict semantic versions", () => {
  const version = parseSemanticVersion("1.2.3-rc.1+build.4");
  assert.deepEqual(version, { major: 1, minor: 2, patch: 3, prerelease: "rc.1", build: "build.4" });
  assert.equal(formatSemanticVersion(bumpSemanticVersion(version, "patch")), "1.2.4");
  assert.equal(formatSemanticVersion(bumpSemanticVersion(version, "minor")), "1.3.0");
  assert.equal(formatSemanticVersion(bumpSemanticVersion(version, "major")), "2.0.0");
});

test("applies labels without allowing invalid semantic versions", () => {
  const version = applyLabels(parseSemanticVersion("1.2.3"), "beta.1", "build.42");
  assert.equal(formatSemanticVersion(version), "1.2.3-beta.1+build.42");
  assert.throws(() => applyLabels(parseSemanticVersion("1.2.3"), "invalid label", undefined), /valid semantic version/);
});
