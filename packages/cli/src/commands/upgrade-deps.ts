/**
 * `holocron upgrade deps` — bring a repo's `@theholocron/*` dependency pins and
 * its `holocron.config.ts` up to the current major.
 *
 * Two concerns:
 *
 * 1. **Catalog pins.** Every `@theholocron/*` entry in `pnpm-workspace.yaml`
 *    (`catalog:` and every named `catalogs.*`) is bumped to the latest published
 *    version, preserving the range prefix (`^` / `~`). Never downgrades.
 * 2. **`holocron.config.ts` migration.** `@theholocron/holocron-config@8`
 *    dropped the 7.x preset shape (`const { repo, workflows, providers } =
 *    node()` + `repo.requiredChecks` + `workflows:`) for a composed-preset
 *    (`const preset = node()` + `...preset` + `tasks:` + `extraRequiredChecks:`).
 *    This applies the mechanical transforms and flags anything that needs a
 *    human eye.
 *
 * After running, `pnpm install && holocron ci`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Logger } from "@theholocron/observability/core";

import { getLogger } from "../logger.js";

// ── npm registry ─────────────────────────────────────────────────────────────

export type FetchLatest = (pkg: string) => Promise<string | null>;

const FETCH_TIMEOUT_MS = 4000;

/** Resolve a package's `latest` dist-tag from the npm registry. */
export const fetchLatestFromNpm: FetchLatest = async (pkg) => {
	try {
		const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { accept: "application/vnd.npm.install-v1+json" },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { "dist-tags"?: Record<string, string> };
		return data["dist-tags"]?.["latest"] ?? null;
	} catch {
		return null;
	}
};

// ── semver (just enough) ─────────────────────────────────────────────────────

/** `a > b` for `x.y.z` release versions (prerelease tags are ignored). */
export function gt(a: string, b: string): boolean {
	const pa = a.split(".").map((n) => parseInt(n, 10));
	const pb = b.split(".").map((n) => parseInt(n, 10));
	for (let i = 0; i < 3; i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) return x > y;
	}
	return false;
}

// ── 1. catalog pins ──────────────────────────────────────────────────────────

const CATALOG_LINE = /^(\s*['"]?)(@theholocron\/[a-z0-9-]+)(['"]?\s*:\s*['"]?)([~^]?)(\d+\.\d+\.\d+[\w.-]*)(['"]?\s*)$/;

export interface CatalogBump {
	pkg: string;
	from: string;
	to: string;
}

/**
 * Rewrite every `@theholocron/*` pin in a `pnpm-workspace.yaml` to `latest`,
 * keeping the range prefix. `latest` is looked up once per package.
 */
export async function bumpCatalogs(
	content: string,
	fetchLatest: FetchLatest
): Promise<{ content: string; bumps: CatalogBump[] }> {
	const lines = content.split("\n");
	const wanted = new Set<string>();
	for (const line of lines) {
		const m = CATALOG_LINE.exec(line);
		if (m) wanted.add(m[2]!);
	}

	const latest = new Map<string, string | null>();
	await Promise.all(
		[...wanted].map(async (pkg) => {
			latest.set(pkg, await fetchLatest(pkg));
		})
	);

	const bumps: CatalogBump[] = [];
	const out = lines.map((line) => {
		const m = CATALOG_LINE.exec(line);
		if (!m) return line;
		const [, pre, pkg, mid, prefix, current, post] = m;
		const next = latest.get(pkg!);
		if (!next || next === current || !gt(next, current!)) return line;
		bumps.push({ pkg: pkg!, from: current!, to: next });
		return `${pre}${pkg}${mid}${prefix}${next}${post}`;
	});

	return { content: out.join("\n"), bumps };
}

// ── 2. holocron.config.ts migration (7.x → 8.x) ──────────────────────────────

export interface ConfigMigration {
	content: string;
	changed: boolean;
	transforms: string[];
	warnings: string[];
}

/** True if the file still uses the 7.x preset shape. */
export function isLegacyConfig(content: string): boolean {
	// Only the 7.x markers count: a `workflows:` key, a `...repo.requiredChecks`
	// spread, or a preset destructure that pulls `workflows`. A config already on
	// `compose()` + `tasks:` + `extraRequiredChecks:` that merely destructures
	// `{ repo, providers }` is valid 8.x — touching it strands `...tasks` /
	// `...extraRequiredChecks` on the removed binding.
	return (
		/\.\.\.repo\.requiredChecks/.test(content) ||
		/^\s*workflows\s*:/m.test(content) ||
		/const\s*\{[^}]*\bworkflows\b[^}]*\}\s*=\s*(compose\(|[a-zA-Z]+\()/.test(content)
	);
}

/**
 * Apply the mechanical 7.x → 8.x transforms to a `holocron.config.ts`. Best
 * effort — the result should always be reviewed and run through `holocron ci`.
 */
export function migrateConfig(content: string): ConfigMigration {
	const transforms: string[] = [];
	const warnings: string[] = [];
	let s = content;

	if (!isLegacyConfig(s)) {
		return { content, changed: false, transforms, warnings };
	}

	// `const { repo, workflows, ... } = <preset>;` → `const preset = <preset>;`
	let destructured: string[] = [];
	s = s.replace(
		/const\s*\{([^}]*)\}\s*=\s*((?:compose\([\s\S]*?\)|[a-zA-Z]+\([\s\S]*?\)))\s*;/,
		(_m, names: string, expr: string) => {
			destructured = names
				.split(",")
				.map((n) => n.trim().split(":")[0]!.trim())
				.filter(Boolean);
			transforms.push("destructured preset → `const preset = …`");
			return `const preset = ${expr.trim()};`;
		}
	);

	// Any binding that was destructured and is still spread bare (`...tasks`,
	// `...extraRequiredChecks`, …) now has to come off `preset`.
	for (const name of destructured) {
		if (name === "repo" || name === "providers" || name === "workflows") continue; // handled explicitly below
		const bare = new RegExp(`\\.\\.\\.${name}\\b(?!\\.)`, "g");
		if (bare.test(s)) {
			s = s.replace(bare, `...preset.${name}`);
			transforms.push(`\`...${name}\` → \`...preset.${name}\``);
		}
	}

	// Inject `...preset,` as the first key of defineConfig({ … })
	if (/const preset =/.test(s) && !/\.\.\.preset\b/.test(s)) {
		s = s.replace(/(defineConfig\(\{\s*\n)/, `$1\t...preset,\n`);
		transforms.push("spread `...preset` into defineConfig()");
	}

	// Drop the top-level destructure pass-throughs — `...preset` covers them.
	s = s.replace(/^\torg,\n/m, "");
	s = s.replace(/^\tdomain,\n/m, "");
	s = s.replace(/^\tdocs,\n/m, "");

	// Spread renames
	if (/\.\.\.repo\.properties/.test(s)) {
		s = s.replace(/\.\.\.repo\.properties/g, "...preset.repo?.properties");
		transforms.push("`...repo.properties` → `...preset.repo?.properties`");
	}
	if (/([{[,]\s*)\.\.\.repo\b(?!\.)/.test(s)) {
		s = s.replace(/([{[,]\s*)\.\.\.repo\b(?!\.)/g, "$1...preset.repo");
		transforms.push("`...repo` → `...preset.repo`");
	}
	if (/\.\.\.providers\b/.test(s)) {
		s = s.replace(/\.\.\.providers\b/g, "...preset.providers");
		transforms.push("`...providers` → `...preset.providers`");
	}

	// `repo.requiredChecks` is gone — the derived checks come from `tasks`.
	// Pull the custom entries out to a top-level `extraRequiredChecks`.
	const rc = /(\n\s*)requiredChecks\s*:\s*\[\s*\n?\s*\.\.\.repo\.requiredChecks\s*,?\s*([\s\S]*?)\n\s*\]\s*,/.exec(s);
	if (rc) {
		const custom = rc[2]!.trim().replace(/,\s*$/, "");
		s = s.replace(rc[0], "");
		if (custom) {
			const block = `\textraRequiredChecks: [\n\t\t${custom
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.join("\n\t\t")}\n\t],\n`;
			s = s.replace(/(defineConfig\(\{\s*\n(?:\t\.\.\.preset,\n)?)/, `$1${block}`);
			transforms.push("`repo.requiredChecks` custom entries → top-level `extraRequiredChecks`");
			warnings.push("check the moved `extraRequiredChecks` — the preset already contributes lint/test/typecheck");
		} else {
			s = s.replace(/,(\s*)\.\.\.repo\.requiredChecks/g, "$1");
			transforms.push("dropped `...repo.requiredChecks`");
		}
	}

	// `workflows:` → `tasks:`  (`...workflows` → `...preset.tasks`)
	if (/^\s*workflows\s*:/m.test(s)) {
		s = s.replace(/(\n\s*)workflows(\s*:\s*\[)/, "$1tasks$2");
		s = s.replace(/\.\.\.workflows\b/g, "...preset.tasks");
		transforms.push("`workflows:` → `tasks:` (`...workflows` → `...preset.tasks`)");
		warnings.push(
			"review the `tasks` array — a bare workflow name that should gate merges now needs `{ name, required: true }`"
		);
	}

	return { content: s, changed: s !== content, transforms, warnings };
}

// ── public API ───────────────────────────────────────────────────────────────

export interface RunUpgradeDepsInput {
	/** Repo root. Defaults to `process.cwd()`. */
	cwd?: string;
	/** Print what would change without writing. */
	dryRun?: boolean;
	/** Skip the `holocron.config.ts` migration (pins only). */
	pinsOnly?: boolean;
	print?: (line: string) => void;
	logger?: Logger;
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	fetchLatest?: FetchLatest;
}

export type UpgradeDepsStatus = "ok" | "fail" | "dry-run";

export interface UpgradeDepsReport {
	status: UpgradeDepsStatus;
	bumps: readonly CatalogBump[];
	configMigrated: boolean;
	configWarnings: readonly string[];
	message?: string;
}

export async function runUpgradeDeps(input: RunUpgradeDepsInput = {}): Promise<UpgradeDepsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const dryRun = input.dryRun ?? false;
	const pinsOnly = input.pinsOnly ?? false;
	const _readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const _writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const fetchLatest = input.fetchLatest ?? fetchLatestFromNpm;

	logger.info({ dryRun: dryRun || undefined, pinsOnly: pinsOnly || undefined }, "upgrade deps: start");
	print(`Upgrading @theholocron/* dependencies${dryRun ? " (dry-run)" : ""}…`);

	// ── 1. catalog pins ──
	const wsPath = join(cwd, "pnpm-workspace.yaml");
	let bumps: CatalogBump[] = [];
	try {
		const ws = _readFile(wsPath);
		const result = await bumpCatalogs(ws, fetchLatest);
		bumps = result.bumps;
		if (bumps.length > 0) {
			if (!dryRun) _writeFile(wsPath, result.content);
			print("");
			print(`  pnpm-workspace.yaml — ${bumps.length} pin${bumps.length === 1 ? "" : "s"}`);
			for (const b of bumps) print(`    ${dryRun ? "~" : "✓"} ${b.pkg}  ${b.from} → ${b.to}`);
		} else {
			print("  · pnpm-workspace.yaml — @theholocron/* pins already current");
		}
	} catch {
		print("  · no pnpm-workspace.yaml — skipping catalog pins");
	}

	// ── 2. holocron.config.ts migration ──
	let configMigrated = false;
	let configWarnings: string[] = [];
	if (!pinsOnly) {
		for (const name of ["holocron.config.ts", "holocron.config.js"]) {
			let cfg: string;
			try {
				cfg = _readFile(join(cwd, name));
			} catch {
				continue;
			}
			const m = migrateConfig(cfg);
			if (!m.changed) {
				print(`  · ${name} — already on the current preset API`);
				break;
			}
			if (!dryRun) _writeFile(join(cwd, name), m.content);
			configMigrated = true;
			configWarnings = m.warnings;
			print("");
			print(`  ${name} — ${dryRun ? "would migrate" : "migrated"} to the 8.x preset API`);
			for (const t of m.transforms) print(`    ${dryRun ? "~" : "✓"} ${t}`);
			for (const w of m.warnings) print(`    ⚠ ${w}`);
			break;
		}
	}

	print("");
	if (bumps.length === 0 && !configMigrated) {
		print("Nothing to do — already up to date.");
	} else {
		print(`Next: ${dryRun ? "run without --dry-run, then " : ""}\`pnpm install && holocron ci\``);
		if (configMigrated) print("      review holocron.config.ts before committing.");
	}

	const status: UpgradeDepsStatus = dryRun ? "dry-run" : "ok";
	logger.info({ bumps: bumps.length, configMigrated, warnings: configWarnings.length, status }, "upgrade deps: done");
	return { status, bumps, configMigrated, configWarnings };
}
