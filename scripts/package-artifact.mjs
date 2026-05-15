#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = process.env.RELEASE_VERSION ?? pkg.version;

const distDir = resolve(root, "dist");
mkdirSync(distDir, { recursive: true });

const artifactName = `jerling-org-v${version}.tar.gz`;
const artifactPath = resolve(distDir, artifactName);

execSync(`tar -czf ${artifactPath} public`, { cwd: root, stdio: "inherit" });

console.log(`packaged ${artifactPath}`);
