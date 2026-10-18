#!/usr/bin/env node
/**
 * Cut a release: bump the version, run the tests, commit, tag, push.
 *
 *   npm run release 0.5.0          # explicit version
 *   npm run release minor          # patch | minor | major
 *   npm run release 0.5.0 --dry    # show what would happen
 *
 * Pushing the `v<version>` tag is what triggers .github/workflows/publish.yml,
 * which publishes to npm over OIDC. Never run `npm publish` locally.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dry = args.includes("--dry") || args.includes("--dry-run");
const wanted = args.filter((a) => !a.startsWith("-"))[0];

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", ...opts }).trim();
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

if (!wanted) fail("usage: npm run release <x.y.z|patch|minor|major> [--dry]");

const pkgPath = join(root, "package.json");
const lockPath = join(root, "package-lock.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version;

/** @returns {string} */
function nextVersion(spec) {
  const semver = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/;
  if (semver.test(spec)) return spec;
  const m = current.match(semver);
  if (!m) fail(`current version "${current}" is not semver`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (spec === "major") return `${major + 1}.0.0`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  return fail(`"${spec}" is not a version or one of patch|minor|major`);
}

const next = nextVersion(wanted);
const tag = `v${next}`;

if (run("git", ["status", "--porcelain"])) fail("working tree is dirty; commit or stash first");
if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("release from main");
if (run("git", ["tag", "-l", tag])) fail(`tag ${tag} already exists`);

console.log(`release: ${current} -> ${next} (tag ${tag})`);

if (!dry) {
  // Bump package.json.
  const bumped = { ...pkg, version: next };
  writeFileSync(pkgPath, `${JSON.stringify(bumped, null, 2)}\n`);

  // Bump the two version fields npm keeps in package-lock.json.
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  console.log("release: running tests…");
  try {
    run("npm", ["test"], { stdio: "inherit" });
  } catch {
    run("git", ["checkout", "--", "package.json", "package-lock.json"]);
    fail("tests failed; version bump reverted");
  }
}

const steps = [
  ["git", ["add", "package.json", "package-lock.json"]],
  ["git", ["commit", "-m", `Bump version to ${next}`]],
  ["git", ["tag", "-a", tag, "-m", tag]],
  ["git", ["push", "origin", "HEAD"]],
  ["git", ["push", "origin", tag]],
];

for (const [cmd, cmdArgs] of steps) {
  console.log(`release: ${dry ? "would run" : "running"} ${cmd} ${cmdArgs.join(" ")}`);
  if (!dry) run(cmd, cmdArgs, { stdio: "inherit" });
}

console.log(
  dry
    ? "release: dry run, nothing changed"
    : `release: pushed ${tag}. GitHub Actions will test and publish to npm over OIDC.`,
);
