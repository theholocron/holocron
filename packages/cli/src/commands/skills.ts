/**
 * `holocron skills` — install and update agent skills from @theholocron/skills.
 *
 * Unlike `holocron setup`, this command is purely local (no GitHub token
 * required). It reads `agent` and `skills` from the config and installs
 * the listed skills into `.agents/skills/<name>/` with a symlink at the
 * agent-specific path (e.g. `.claude/skills/<name>` for Claude Code).
 *
 * `holocron skills update` fetches external skills from their upstream GitHub
 * sources, compares content hashes, and overwrites changed files in the
 * skills registry. It is meant to be run from within the theholocron/skills
 * repo, but falls back to the installed @theholocron/skills package when no
 * local skills-lock.json is found.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { LoadedConfig } from "../load-config.js";
import type { RuntimeContext } from "../loader.js";
import { installSkills } from "./setup.js";

// ── install ──────────────────────────────────────────────────────────────────

export interface RunSkillsInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	print?: (line: string) => void;
}

export async function runSkillsInstall(input: RunSkillsInput): Promise<void> {
	const print = input.print ?? ((line: string) => console.log(line));
	const config = input.loaded.resolved;

	if (!config.agent || !config.skills?.length) {
		print("Nothing to install — set `agent` and `skills` in holocron.config.ts");
		return;
	}

	if (input.context.dryRun) {
		print(`Would install ${config.skills.length} skill(s) for agent: ${config.agent}`);
		for (const name of config.skills) {
			print(`  → would install: ${name}`);
		}
		return;
	}

	print(`Installing ${config.skills.length} skill(s) for agent: ${config.agent}`);
	try {
		const result = await installSkills({
			agent: config.agent,
			skills: config.skills,
			repoRoot: input.context.repoRoot,
		});
		print(`  → ${result}`);
	} catch (err) {
		print(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
	}
}

// ── update ───────────────────────────────────────────────────────────────────

export interface SkillLockEntry {
	source: string;
	sourceType: "github";
	skillPath: string;
	computedHash: string;
}

export interface SkillsLock {
	version: 1;
	skills: Record<string, SkillLockEntry>;
}

export interface RunSkillsUpdateInput {
	context: RuntimeContext;
	/** When given, only update the named skills. Defaults to all entries. */
	names?: string[];
	print?: (line: string) => void;
}

export interface SkillsUpdateReport {
	updated: number;
	unchanged: number;
	failed: string[];
}

async function resolveLockFile(repoRoot: string): Promise<{ lockPath: string; lockDir: string }> {
	const localLock = join(repoRoot, "skills-lock.json");
	try {
		await readFile(localLock);
		return { lockPath: localLock, lockDir: repoRoot };
	} catch {
		// Fall back to installed @theholocron/skills package.
		const req = createRequire(pathToFileURL(join(repoRoot, "package.json")));
		let pkgRoot: string;
		try {
			pkgRoot = dirname(req.resolve("@theholocron/skills/package.json"));
		} catch {
			throw new Error(
				"skills-lock.json not found in cwd and @theholocron/skills is not installed — " +
					"run: pnpm add -D @theholocron/skills"
			);
		}
		return { lockPath: join(pkgRoot, "skills-lock.json"), lockDir: pkgRoot };
	}
}

async function fetchSkillContent(entry: SkillLockEntry): Promise<string> {
	if (entry.sourceType !== "github") {
		throw new Error(`unsupported sourceType "${entry.sourceType}"`);
	}
	const url = `https://raw.githubusercontent.com/${entry.source}/HEAD/${entry.skillPath}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} fetching ${url}`);
	}
	return res.text();
}

export function computeSkillHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export async function runSkillsUpdate(input: RunSkillsUpdateInput): Promise<SkillsUpdateReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const { dryRun, repoRoot } = input.context;

	const { lockPath, lockDir } = await resolveLockFile(repoRoot);
	const lock = JSON.parse(await readFile(lockPath, "utf8")) as SkillsLock;

	const names = input.names?.length ? input.names : Object.keys(lock.skills);

	let updated = 0;
	let unchanged = 0;
	const failed: string[] = [];

	for (const name of names) {
		const entry = lock.skills[name];
		if (!entry) {
			print(`  · ${name} — not in skills-lock.json`);
			failed.push(name);
			continue;
		}

		let content: string;
		try {
			content = await fetchSkillContent(entry);
		} catch (err) {
			print(`  ✗ ${name} — ${err instanceof Error ? err.message : String(err)}`);
			failed.push(name);
			continue;
		}

		const hash = computeSkillHash(content);
		if (hash === entry.computedHash) {
			print(`  · ${name} — unchanged`);
			unchanged++;
			continue;
		}

		if (dryRun) {
			print(`  ~ ${name} — would update`);
			updated++;
			continue;
		}

		const skillFile = join(lockDir, "skills", name, "SKILL.md");
		await mkdir(dirname(skillFile), { recursive: true });
		await writeFile(skillFile, content);
		lock.skills[name]!.computedHash = hash;

		print(`  ✓ ${name} — updated`);
		updated++;
	}

	if (!dryRun && updated > 0) {
		await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
	}

	print("");
	const summary = `  ${updated} updated, ${unchanged} unchanged${failed.length > 0 ? `, ${failed.length} failed` : ""}`;
	print(summary);

	return { updated, unchanged, failed };
}
