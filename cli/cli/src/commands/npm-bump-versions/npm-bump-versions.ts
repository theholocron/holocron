import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { stringifyJson } from "@theholocron/json-utils";
import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

import { getLogger } from "../../observability/logger/index.js";
import type { NpmBumpVersionsReport, RunNpmBumpVersionsInput } from "./npm-bump-versions.type.js";

export async function runNpmBumpVersions(input: RunNpmBumpVersionsInput): Promise<NpmBumpVersionsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const { version, dryRun = false, group, excludeGroups } = input;
	const readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const listDir = input.listDir ?? ((p: string) => readdirSync(p) as string[]);
	const isDir = input.isDir ?? ((p: string) => statSync(p).isDirectory());

	const bumped: string[] = [];
	const skipped: string[] = [];

	const scopeLabel = group
		? `group ${group}`
		: excludeGroups?.length
			? `monorepo, leaving out ${excludeGroups.join(", ")},`
			: "monorepo";
	print(`Bumping ${scopeLabel} to ${version}${dryRun ? " (dry-run)" : ""}…`);
	logger.info({ version, group, excludeGroups, dryRun: dryRun || undefined }, "npm bump-versions: start");

	// A listed folder missing from the workspace is either outside the group (valid manifest, say nothing)
	// or really unreadable (warn).
	function hasReadableManifest(absPath: string): boolean {
		try {
			JSON.parse(readFile(absPath));
			return true;
		} catch {
			return false;
		}
	}

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
	// A group leaves it alone: every group's release would otherwise rewrite one shared file.
	if (!group) bumpFile(join(cwd, "package.json"), "root");

	// Every package the workspace declares; a group whose dir doesn't exist
	// no-ops safely, so a single-package repo with none just gets the root bump.
	const listed = new Set<string>();
	const workspace = discoverWorkspacePackages(cwd, {
		readFile,
		readText: readFile,
		...(group ? { group } : {}),
		...(excludeGroups?.length ? { excludeGroups } : {}),
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
	if (group && workspace.length === 0) {
		const message = `no packages in group "${group}"`;
		print(`  ✗ ${message}`);
		logger.info({ version, group, status: "fail" }, "npm bump-versions: done");
		return { status: "fail", bumped, skipped, message };
	}
	const found = new Set(workspace.map((entry) => entry.dir));
	for (const dir of listed) {
		if (found.has(dir) || hasReadableManifest(join(dir, "package.json"))) continue;
		print(`  ! skipping ${relative(resolve(cwd), dir)}: no package.json or malformed JSON`);
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
