import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";

import { walkFilesSync } from "@theholocron/fs-utils";
import { errorMessage } from "@theholocron/misc-utils";

import { detectNodeMajor } from "../detect-node-major/index.js";
import { patchDockerfile } from "../patch-dockerfile/index.js";
import { patchPackageJson } from "../patch-package-json/index.js";
import { patchPinFile } from "../patch-pin-file/index.js";
import { patchToolVersions } from "../patch-tool-versions/index.js";
import { patchYaml } from "../patch-yaml/index.js";
import type { NodePinPattern, RunUpgradeNodeInput, UpgradeNodeLogger, UpgradeNodeReport } from "./upgrade-node.type.js";

/** Directories skipped when walking the repo tree. */
const SKIP_DIRS = ["node_modules", ".git", "dist", "coverage", "build", ".turbo", ".next", "out"];

/**
 * The registry of files that pin a Node.js major. To cover a new file type, add an entry here: a `matches`
 * predicate on the basename and a `patch` function.
 */
const PATTERNS: NodePinPattern[] = [
	{ matches: (n) => n === "package.json", patch: patchPackageJson },
	{ matches: (n) => n.endsWith(".yml") || n.endsWith(".yaml"), patch: patchYaml },
	{ matches: (n) => n === ".nvmrc" || n === ".node-version", patch: patchPinFile },
	{ matches: (n) => n === "Dockerfile" || n.startsWith("Dockerfile."), patch: patchDockerfile },
	{ matches: (n) => n === ".tool-versions", patch: patchToolVersions },
];

const noopLogger: UpgradeNodeLogger = { debug() {}, info() {}, warn() {} };

const defaultWalkFiles = (dir: string): string[] => walkFilesSync(dir, { skip: SKIP_DIRS });

/**
 * Scan a repo and rewrite every Node.js version pin (`engines.node`, `@types/node`, `.nvmrc`,
 * `.node-version`, workflow `node-version:`, Dockerfile `FROM node:`, `.tool-versions`) from one major to
 * another. The current major is auto-detected when `from` is omitted.
 *
 * Never throws: an unreadable tree or an undetectable version resolves to `{ status: "fail", message }`.
 *
 * @param input - Target major, optional source major, and injectable I/O.
 * @returns The status and the repo-relative paths that were (or, in dry-run, would be) patched.
 */
export async function runUpgradeNode(input: RunUpgradeNodeInput): Promise<UpgradeNodeReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? noopLogger;
	const cwd = input.cwd ?? process.cwd();
	const { to, dryRun = false, extra = [] } = input;
	const _readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const _writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const _walkFiles = input.walkFiles ?? defaultWalkFiles;

	// Read the tree first: an unreadable directory is its own failure, not
	// "couldn't detect the version" or "already up to date".
	let walked: string[];
	try {
		walked = _walkFiles(cwd);
	} catch (error) {
		const message = `could not read ${cwd}: ${errorMessage(error)}`;
		logger.warn({ to, reason: message }, "upgrade node: done");
		return { status: "fail", updated: [], message };
	}

	const from = input.from ?? detectNodeMajor(cwd, _readFile);
	if (from === null) {
		const message = "could not detect current Node version — pass --from <major>";
		logger.warn({ to, reason: message }, "upgrade node: done");
		return { status: "fail", updated: [], message };
	}

	logger.info({ from, to, dryRun: dryRun || undefined }, "upgrade node: start");

	if (from === to) {
		print(`Already at Node.js ${to} — nothing to do.`);
		logger.info({ from, to, updated: 0, status: "ok" }, "upgrade node: done");
		return { status: "ok", updated: [] };
	}

	print(`Upgrading Node.js ${from} → ${to}${dryRun ? " (dry-run)" : ""}…`);

	const updated: string[] = [];
	const root = resolve(cwd);
	const scanned = [...walked, ...extra.map((p) => join(cwd, p))];

	for (const abs of scanned) {
		const name = basename(abs);
		const pattern = PATTERNS.find((p) => p.matches(name));
		if (!pattern) continue;

		let content: string;
		try {
			content = _readFile(abs);
		} catch {
			continue;
		}

		const patched = pattern.patch(content, from, to);
		if (patched === null) continue;

		const absolute = resolve(abs);
		const rel = absolute.startsWith(root + sep) ? absolute.slice(root.length + 1) : abs;
		if (!dryRun) _writeFile(abs, patched);
		print(`  ${dryRun ? "~" : "✓"} ${rel}`);
		logger.debug({ file: rel, from, to }, "upgrade node: patched");
		updated.push(rel);
	}

	if (updated.length === 0) {
		print(`  · no files contained Node.js ${from} pins`);
	}

	const status = dryRun ? "dry-run" : "ok";
	logger.info({ from, to, updated: updated.length, status }, "upgrade node: done");
	return { status, updated };
}
