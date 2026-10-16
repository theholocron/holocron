import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { stringifyJson } from "@theholocron/json-utils";
import { listWorkspacePackagesSync } from "@theholocron/pkg-utils";

import { getLogger } from "../../observability/logger/logger.js";
import type { NpmBumpVersionsReport, RunNpmBumpVersionsInput } from "./npm-bump-versions.type.js";

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
		let raw: string;
		try {
			raw = readFile(absPath);
			pkg = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			print(`  ✗ could not parse ${label}`);
			return;
		}
		const old = pkg.version as string;
		if (!dryRun) {
			pkg.version = version;
			writeFile(absPath, stringifyJson(pkg, { like: raw }));
		}
		print(`  ${dryRun ? "~" : "✓"} ${label}: ${old} → ${version}`);
		bumped.push(label);
	}

	// Root is always bumped — private means "don't publish", not "don't version".
	bumpFile(join(cwd, "package.json"), "root");

	// Each root no-ops safely when its dir doesn't exist — a single-package
	// repo with neither just gets the root bump.
	const listed = new Set<string>();
	const workspace = listWorkspacePackagesSync(cwd, {
		readFile,
		listDirs: (dir) => {
			let names: string[];
			try {
				names = listDir(dir);
			} catch {
				throw Object.assign(new Error(`ENOENT: ${dir}`), { code: "ENOENT" });
			}
			return names.filter((name) => {
				try {
					if (!isDir(join(dir, name))) return false;
				} catch {
					return false;
				}
				listed.add(join(dir, name));
				return true;
			});
		},
	});
	const found = new Set(workspace.map((entry) => entry.dir));
	for (const dir of listed) {
		if (!found.has(dir)) print(`  ! skipping ${relative(resolve(cwd), dir)}: no package.json or malformed JSON`);
	}
	for (const { dir, relativeDir, manifest } of workspace) {
		if (manifest.private) {
			print(`  · skipping private package ${relativeDir}`);
			skipped.push(relativeDir);
			continue;
		}
		bumpFile(join(dir, "package.json"), relativeDir);
	}

	const status = dryRun ? "dry-run" : "ok";
	logger.info({ version, status, bumped: bumped.length, skipped: skipped.length }, "npm bump-versions: done");
	return { status, bumped, skipped };
}
