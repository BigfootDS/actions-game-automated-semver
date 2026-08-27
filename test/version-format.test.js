const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatVersion,
  parseVersionFormat,
  validateVersionFormat,
} = require("../lib/version-format.js");

test("parses and renders literal prefixes, suffixes, and punctuation", () => {
  const format = "Release ({major}-{minor}-{patch}) - beta";
  const parsed = parseVersionFormat("Release (1-2-3) - beta", format);
  assert.deepEqual(parsed, { major: 1, minor: 2, patch: 3 });
  assert.equal(formatVersion(parsed, format), "Release (1-2-3) - beta");
});

test("supports semantic labels while treating surrounding text as literal", () => {
  const format = "v{major}.{minor}.{patch}-{releaseLabel}+{buildLabel}";
  const parsed = parseVersionFormat("v1.2.3-rc.1+build.42", format);
  assert.deepEqual(parsed, {
    major: 1,
    minor: 2,
    patch: 3,
    releaseLabel: "rc.1",
    buildLabel: "build.42",
  });
});

test("rejects unsafe or ambiguous version templates", () => {
  assert.throws(() => validateVersionFormat("{major}.{minor}"), /patch/);
  assert.throws(() => validateVersionFormat("{major}.{minor}.{patch}.{patch}"), /must not repeat/);
  assert.throws(() => validateVersionFormat("{major}.{minor}.{revision}"), /patch/);
  assert.throws(() => validateVersionFormat("{major}.{minor}.{patch}-{banana}"), /unsupported placeholder/);
  assert.throws(
    () => parseVersionFormat("v1.2.3-demo", "v{major}.{minor}.{patch}-beta"),
    /does not match/,
  );
});
