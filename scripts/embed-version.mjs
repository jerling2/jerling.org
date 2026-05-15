#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const version = process.env.RELEASE_VERSION ?? pkg.version;
const sha =
  process.env.GITHUB_SHA ??
  execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
const builtAt = new Date().toISOString();

const target = resolve(root, "public", "version.json");
writeFileSync(
  target,
  JSON.stringify({ version, sha, builtAt }, null, 2) + "\n",
);

console.log(`wrote ${target}: v${version} @ ${sha.slice(0, 7)} (${builtAt})`);
