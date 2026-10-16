import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";

import { walkFilesSync } from "@theholocron/fs-utils";
import { stringifyJson } from "@theholocron/json-utils";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import type { Pattern, RunUpgradeNodeInput, UpgradeNodeReport } from "./upgrade-node.type.js";

// Directories to skip when walking the repo tree
const SKIP_DIRS = ["node_modules", ".git", "dist", "coverage", "build", ".turbo", ".next", "out"];

// ── per-file-type patch functions ─────────────────────────────────────────────
// Each returns the new file content, or null if nothing in that file changed.

function patchPackageJson(content: string, from: number, to: number): string | null {
	let pkg: Record<string, unknown>;
	try {
		pkg = JSON.parse(content) as Record<string, unknown>;
	} catch {
		return null;
	}

	let changed = false;

	const engines = pkg.engines as Record<string, string> | undefined;
	if (engines?.node && /^>=\d+(?:\.0\.0)?$/.test(engines.node)) {
		const major = parseInt(engines.node.match(/\d+/)![0]!, 10);
		if (major === from) {
			engines.node = `>=${to}.0.0`;
			changed = true;
		}
	}

	for (const field of ["devDependencies", "dependencies"] as const) {
		const deps = pkg[field] as Record<string, string> | undefined;
		if (!deps?.["@types/node"]) continue;
		// Only update exact semver ranges; leave catalog: pins alone
		if (deps["@types/node"] === `^${from}.0.0`) {
			deps["@types/node"] = `^${to}.0.0`;
			changed = true;
		}
	}

	return changed ? stringifyJson(pkg, { like: content }) : null;
}

function patchYaml(content: string, from: number, to: number): string | null {
	// node-version: 20  /  node-version: '20'  /  node-version: "20"
	const updated = content.replace(/node-version:\s+['"]?(\d+)['"]?/g, (match, ver) =>
		ver === String(from) ? match.replace(String(from), String(to)) : match
	);
	return updated !== content ? updated : null;
}

function patchPinFile(content: string, from: number, to: number): string | null {
	// .nvmrc / .node-version — "20" or "20.x.y" on the first line
	const trimmed = content.trim();
	if (trimmed === String(from) || trimmed.startsWith(`${from}.`)) {
		return `${to}\n`;
	}
	return null;
}

function patchDockerfile(content: string, from: number, to: number): string | null {
	// FROM node:20  /  FROM node:20-alpine  /  FROM node:20.11.0
	const updated = content.replace(/^(FROM\s+node:)(\d+)/gm, (match, prefix, ver) =>
		ver === String(from) ? `${prefix}${to}` : match
	);
	return updated !== content ? updated : null;
}

function patchToolVersions(content: string, from: number, to: number): string | null {
	// nodejs 20  /  nodejs 20.11.0
	const updated = content.replace(/^(nodejs\s+)(\d+)/gm, (match, prefix, ver) =>
		ver === String(from) ? `${prefix}${to}` : match
	);
	return updated !== content ? updated : null;
}

const PATTERNS: Pattern[] = [
	{ matches: (n) => n === "package.json", patch: patchPackageJson },
	{ matches: (n) => n.endsWith(".yml") || n.endsWith(".yaml"), patch: patchYaml },
	{ matches: (n) => n === ".nvmrc" || n === ".node-version", patch: patchPinFile },
	{ matches: (n) => n === "Dockerfile" || n.startsWith("Dockerfile."), patch: patchDockerfile },
	{ matches: (n) => n === ".tool-versions", patch: patchToolVersions },
];

// ── auto-detect current major from the repo ───────────────────────────────────

function detectFrom(cwd: string, _readFile: (p: string) => string): number | null {
	for (const name of [".nvmrc", ".node-version"]) {
		try {
			const major = parseInt(_readFile(join(cwd, name)).trim(), 10);
			if (!isNaN(major)) return major;
		} catch {
			/* absent */
		}
	}
	try {
		const pkg = JSON.parse(_readFile(join(cwd, "package.json"))) as Record<string, unknown>;
		const node = (pkg.engines as Record<string, string> | undefined)?.node;
		if (node) {
			const m = node.match(/(\d+)/);
			if (m) return parseInt(m[1]!, 10);
		}
	} catch {
		/* absent */
	}
	return null;
}

// ── default file walker ───────────────────────────────────────────────────────

const defaultWalkFiles = (dir: string): string[] => walkFilesSync(dir, { skip: SKIP_DIRS });

export async function runUpgradeNode(input: RunUpgradeNodeInput): Promise<UpgradeNodeReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
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

	const from = input.from ?? detectFrom(cwd, _readFile);
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
