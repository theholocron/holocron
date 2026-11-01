#!/usr/bin/env node
/**
 * Warns when a PR ships a feature without touching the docs. Two checks, both warning-only:
 *
 * 1. A new public package: a new <package dir>/src/index.ts where package.json has no "private: true", and no docs
 *    change at all (any file under docs/ or matching .md / .mdx).
 * 2. A `feat` that changes a public package's source (src/** or a root index.ts) without a docs signal for that
 *    package: its README, a docs page named after it, or a doc comment in the diff of its source (#1515).
 *
 * The escape hatch for the second is a marker with a reason in the PR description or in a commit message, like
 * semantic-release's `[skip ci]`:
 *
 *     [skip docs] the new option is internal and has no page
 *     [skip docs: array-utils] only this package needs no page
 *
 * A marker with no reason does not count. Exits 0 either way, so it never blocks emergency fixes.
 *
 * Usage: node scripts/validate-docs-presence.mjs
 * Env:   BASE_SHA  — base commit SHA to diff against (defaults to HEAD~1)
 *        PR_TITLE  — optional, the pull request title (a `feat` is also read from the commit subjects)
 *        PR_BODY   — optional, the pull request description (the marker is also read from the commit messages)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate, isAddedDocComment, isFeat, packageOf, parseSkipDocs } from "./docs-presence.lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseSha = process.env["BASE_SHA"] ?? "HEAD~1";

function git(args) {
	return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
}

function readPackage(dir) {
	const path = join(root, dir, "package.json");
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

let addedFiles;
let allChanged;
try {
	addedFiles = git(`diff --name-only --diff-filter=A ${baseSha} HEAD`).split("\n").filter(Boolean);
	allChanged = git(`diff --name-only ${baseSha} HEAD`).split("\n").filter(Boolean);
} catch {
	console.log("Could not determine changed files — skipping docs-presence check.");
	process.exit(0);
}

// 1. New public packages: an added <package dir>/src/index.ts (any workspace layout: packages/x, clients/x, observability, ...) whose package.json is not private
const newPackages = [];
for (const file of addedFiles) {
	const match = file.match(/^(.+)\/src\/index\.ts$/);
	if (!match || match[1].includes("node_modules")) continue;
	const pkgDir = match[1];
	const pkg = readPackage(pkgDir);
	if (pkg && !pkg.private) newPackages.push(pkgDir.split("/").at(-1));
}

if (newPackages.length === 0) {
	console.log("No new public packages — docs-presence check passed.");
} else {
	const hasDocsChange = allChanged.some((f) => f.startsWith("docs/") || f.endsWith(".md") || f.endsWith(".mdx"));
	console.log(`\nNew public package(s): ${newPackages.join(", ")}`);
	if (!hasDocsChange) {
		console.warn("\n⚠  Docs-presence warning: new package(s) added without a docs change.\n");
		console.warn(`   New packages: ${newPackages.join(", ")}\n`);
		console.warn("   Add a docs page under docs/ in this PR, or open a scoped follow-up PR");
		console.warn("   immediately after — docs should ship with the feature.\n");
	} else {
		console.log("Docs change detected — docs-presence check passed.");
	}
}

// 2. A `feat` that changes a package without a docs signal
function safeGit(args) {
	try {
		return git(args);
	} catch {
		return "";
	}
}

const subjects = [process.env["PR_TITLE"] ?? "", ...safeGit(`log ${baseSha}..HEAD --format=%s`).split("\n")].filter(
	Boolean
);

if (isFeat(subjects)) {
	const packages = [...new Set(allChanged.map((f) => packageOf(f, readPackage)).filter(Boolean))];
	if (packages.length === 0) {
		console.log("A feature, but no public package source changed — nothing to check.");
	} else {
		const messages = `${process.env["PR_BODY"] ?? ""}\n${safeGit(`log ${baseSha}..HEAD --format=%B`)}`;
		const { warn, skipped, missingReason } = evaluate({
			packages,
			changedFiles: allChanged,
			addedCommentLines: (dir) =>
				safeGit(`diff -U0 ${baseSha} HEAD -- ${dir}/src ${dir}/index.ts`).split("\n").filter(isAddedDocComment),
			skip: parseSkipDocs(messages),
		});
		for (const { dir, reason } of skipped) console.log(`Docs check skipped for ${dir}: ${reason}`);
		if (warn.length === 0) {
			console.log(
				"Every changed package has a docs signal or a [skip docs] reason — docs-presence check passed."
			);
		} else {
			console.warn("\n⚠  Docs-presence warning: this feature changes package source without a docs change.\n");
			console.warn(`   Packages: ${warn.join(", ")}\n`);
			console.warn("   Update the package's README or docs page, or a doc comment, in this PR.");
			console.warn("   If no docs change is needed, say why in the PR description:");
			console.warn("     [skip docs] <reason>   (or [skip docs: <package>] <reason>)\n");
			if (missingReason) console.warn("   A [skip docs] marker was found, but it has no reason after it.\n");
		}
	}
}

// Exit 0 — warning only, does not block the PR.
process.exit(0);
