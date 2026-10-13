import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Logger } from "@theholocron/observability/core";

import { getLogger } from "../logger.js";

export interface RunNpmBumpVersionsInput {
	/** Next version string (e.g., "4.2.0" or "2.0.0-alpha.1"). */
	version: string;
	/** Working directory (monorepo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would change without writing anything. */
	dryRun?: boolean;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	listDir?: (path: string) => string[];
	isDir?: (path: string) => boolean;
}

export type BumpVersionsStatus = "ok" | "fail" | "dry-run";

export interface NpmBumpVersionsReport {
	status: BumpVersionsStatus;
	bumped: readonly string[];
	skipped: readonly string[];
	message?: string;
}

export async function runNpmBumpVersions(input: RunNpmBumpVersionsInput): Promise<NpmBumpVersionsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const { version, dryRun = false } = input;
	const readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const listDir = input.listDir ?? ((p: string) => readdirSync(p) as string[]);
	const isDir = input.isDir ?? ((p: string) => statSync(p).isDirectory());

	const bumped: string[] = [];
	const skipped: string[] = [];

	print(`Bumping monorepo to ${version}${dryRun ? " (dry-run)" : ""}…`);
	logger.info({ version, dryRun: dryRun || undefined }, "npm bump-versions: start");

	function bumpFile(absPath: string, label: string): void {
		let pkg: Record<string, unknown>;
		try {
			pkg = JSON.parse(readFile(absPath)) as Record<string, unknown>;
		} catch {
			print(`  ✗ could not parse ${label}`);
			return;
		}
		const old = pkg.version as string;
		if (!dryRun) {
			pkg.version = version;
			writeFile(absPath, JSON.stringify(pkg, null, 2) + "\n");
		}
		print(`  ${dryRun ? "~" : "✓"} ${label}: ${old} → ${version}`);
		bumped.push(label);
	}

	// Root is always bumped — private means "don't publish", not "don't version".
	bumpFile(join(cwd, "package.json"), "root");

	function bumpWorkspaceDir(dirName: "packages" | "plugins"): void {
		const dirPath = join(cwd, dirName);
		let entries: string[];
		try {
			entries = listDir(dirPath);
		} catch {
			return;
		}
		for (const entry of entries) {
			const pkgDir = join(dirPath, entry);
			try {
				if (!isDir(pkgDir)) continue;
			} catch {
				continue;
			}
			const pkgFile = join(pkgDir, "package.json");
			let pkg: Record<string, unknown>;
			try {
				pkg = JSON.parse(readFile(pkgFile)) as Record<string, unknown>;
			} catch {
				print(`  ! skipping ${dirName}/${entry}: no package.json or malformed JSON`);
				continue;
			}
			if (pkg.private) {
				print(`  · skipping private package ${dirName}/${entry}`);
				skipped.push(`${dirName}/${entry}`);
				continue;
			}
			bumpFile(pkgFile, `${dirName}/${entry}`);
		}
	}

	// Each no-ops safely (via the listDir catch above) when its dir doesn't
	// exist — a single-package repo with neither just gets the root bump.
	bumpWorkspaceDir("packages");
	bumpWorkspaceDir("plugins");

	const status = dryRun ? "dry-run" : "ok";
	logger.info({ version, status, bumped: bumped.length, skipped: skipped.length }, "npm bump-versions: done");
	return { status, bumped, skipped };
}
