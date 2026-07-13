import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Directories to skip when walking the repo tree
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "build", ".turbo", ".next", "out"]);

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
	if (engines?.node === `>=${from}.0.0`) {
		engines.node = `>=${to}.0.0`;
		changed = true;
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

	return changed ? JSON.stringify(pkg, null, 2) + "\n" : null;
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

interface Pattern {
	matches: (filename: string) => boolean;
	patch: (content: string, from: number, to: number) => string | null;
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

function defaultWalkFiles(dir: string): string[] {
	const results: string[] = [];

	function walk(current: string): void {
		let entries: string[];
		try {
			entries = readdirSync(current);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry)) continue;
			const abs = join(current, entry);
			try {
				if (statSync(abs).isDirectory()) walk(abs);
				else results.push(abs);
			} catch {
				/* skip unreadable */
			}
		}
	}

	walk(dir);
	return results;
}

// ── public API ────────────────────────────────────────────────────────────────

export interface RunUpgradeNodeInput {
	/** Target Node.js major version (e.g., 22). */
	to: number;
	/** Source major version. Auto-detected from .nvmrc / engines.node when omitted. */
	from?: number;
	/** Working directory (repo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would change without writing anything. */
	dryRun?: boolean;
	/**
	 * Extra file paths (relative to cwd) to scan in addition to the normal
	 * walk. Use for non-conventional locations not covered by the pattern
	 * registry (e.g., custom Dockerfiles, .tool-versions in a subdirectory).
	 * Sourced from `upgrade.node.extra` in holocron.config.json.
	 */
	extra?: string[];
	print?: (line: string) => void;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	walkFiles?: (dir: string) => string[];
}

export type UpgradeNodeStatus = "ok" | "fail" | "dry-run";

export interface UpgradeNodeReport {
	status: UpgradeNodeStatus;
	updated: readonly string[];
	message?: string;
}

export async function runUpgradeNode(input: RunUpgradeNodeInput): Promise<UpgradeNodeReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const cwd = input.cwd ?? process.cwd();
	const { to, dryRun = false, extra = [] } = input;
	const _readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const _writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const _walkFiles = input.walkFiles ?? defaultWalkFiles;

	const from = input.from ?? detectFrom(cwd, _readFile);
	if (from === null) {
		return {
			status: "fail",
			updated: [],
			message: "could not detect current Node version — pass --from <major>",
		};
	}

	if (from === to) {
		print(`Already at Node.js ${to} — nothing to do.`);
		return { status: "ok", updated: [] };
	}

	print(`Upgrading Node.js ${from} → ${to}${dryRun ? " (dry-run)" : ""}…`);

	const updated: string[] = [];
	const scanned = [..._walkFiles(cwd), ...extra.map((p) => join(cwd, p))];

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

		const rel = abs.startsWith(cwd + "/") ? abs.slice(cwd.length + 1) : abs;
		if (!dryRun) _writeFile(abs, patched);
		print(`  ${dryRun ? "~" : "✓"} ${rel}`);
		updated.push(rel);
	}

	if (updated.length === 0) {
		print(`  · no files contained Node.js ${from} pins`);
	}

	return { status: dryRun ? "dry-run" : "ok", updated };
}
