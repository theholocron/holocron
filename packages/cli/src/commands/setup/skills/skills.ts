import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { isWorkspaceRoot } from "@theholocron/fs-utils";
import { updateGitignore } from "@theholocron/git-utils";

import type { SkillLockEntry, SkillsLock } from "./skills.type.js";

async function fetchExternalSkill(entry: SkillLockEntry): Promise<{ content: string; stale: boolean }> {
	if (entry.sourceType !== "github") {
		/* c8 ignore next */
		throw new Error(`unsupported sourceType: ${entry.sourceType}`);
	}
	const url = `https://raw.githubusercontent.com/${entry.source}/HEAD/${entry.skillPath}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
	const content = await res.text();
	const stale = !!entry.computedHash && createHash("sha256").update(content).digest("hex") !== entry.computedHash;
	return { content, stale };
}

const AGENTS_SKILLS_ROOT = ".agents/skills";

/** Relative path of the agent-specific symlink. undefined = unsupported agent. */
export const AGENT_SYMLINK_PATHS: Partial<Record<string, (name: string) => string>> = {
	claude: (name) => `.claude/skills/${name}`,
};

const GITIGNORE_BLOCK_START = "# managed by holocron setup — skills";
// Safety invariant: GITIGNORE_BLOCK_START must NOT be a substring of
// GITIGNORE_BLOCK_END. The "# end " prefix currently guarantees this — if
// either string is edited, verify the invariant still holds so that
// indexOf(GITIGNORE_BLOCK_START) cannot match inside the end marker.
const GITIGNORE_BLOCK_END = "# end managed by holocron setup — skills";

export async function installSkills({
	agent,
	skills,
	repoRoot,
}: {
	agent: string;
	skills: string[];
	repoRoot: string;
}): Promise<string> {
	const symlinkFn = AGENT_SYMLINK_PATHS[agent];
	if (!symlinkFn) {
		return `agent "${agent}" has no known skill install path — skipping`;
	}

	const require = createRequire(pathToFileURL(join(repoRoot, "package.json")));
	let skillsRoot: string;
	try {
		skillsRoot = dirname(require.resolve("@theholocron/skills/package.json"));
	} catch {
		const atWorkspaceRoot = await isWorkspaceRoot(repoRoot);
		// In a pnpm workspace, `pnpm add` at the root refuses to run without
		// -w (ERR_PNPM_ADDING_TO_ROOT) -- it assumes a root-level add is a
		// mistake meant for one of the workspace's own packages (holocron#653).
		// stderr is captured (not inherited) only so a failed first attempt
		// can be inspected for that specific error below; it's forwarded
		// either way once the outcome is known.
		let result = spawnSync("pnpm", ["add", "-D", ...(atWorkspaceRoot ? ["-w"] : []), "@theholocron/skills"], {
			cwd: repoRoot,
			stdio: ["inherit", "inherit", "pipe"],
			encoding: "utf8",
		});
		if (result.status !== 0 && !atWorkspaceRoot && result.stderr?.includes("ERR_PNPM_ADDING_TO_ROOT")) {
			// pnpm-workspace.yaml appeared between the isWorkspaceRoot() check
			// above and this call (e.g. a concurrent `holocron setup` run) --
			// pnpm's own rejection is the authoritative signal, so retry
			// with -w instead of re-checking the filesystem a second time.
			process.stderr.write(result.stderr);
			result = spawnSync("pnpm", ["add", "-D", "-w", "@theholocron/skills"], {
				cwd: repoRoot,
				stdio: "inherit",
				encoding: "utf8",
			});
		} else if (result.status !== 0 && result.stderr) {
			process.stderr.write(result.stderr);
		}
		if (result.status !== 0) {
			throw new Error("failed to auto-install @theholocron/skills");
		}
		try {
			skillsRoot = dirname(require.resolve("@theholocron/skills/package.json"));
		} catch {
			throw new Error("failed to auto-install @theholocron/skills");
		}
	}

	const gitignorePath = join(repoRoot, ".gitignore");
	const existingContent = await readFile(gitignorePath, "utf8").catch(() => "");
	const previouslyInstalled = parsePreviousSkills(existingContent, symlinkFn);
	const currentSet = new Set(skills);
	const stale = previouslyInstalled.filter((n) => !currentSet.has(n));
	for (const name of stale) {
		await rm(join(repoRoot, symlinkFn(name)), { force: true }).catch(() => undefined);
		await rm(join(repoRoot, AGENTS_SKILLS_ROOT, name), { recursive: true, force: true }).catch(() => undefined);
	}

	const installed: string[] = [];
	const missing: string[] = [];

	for (const name of skills) {
		const srcDir = join(skillsRoot, "src", name);

		try {
			await stat(srcDir);
		} catch {
			missing.push(name);
			continue;
		}

		const agentsDir = join(repoRoot, AGENTS_SKILLS_ROOT, name);
		await copyDirRecursive(srcDir, agentsDir);

		const symlinkPath = join(repoRoot, symlinkFn(name));
		await mkdir(dirname(symlinkPath), { recursive: true });
		try {
			await unlink(symlinkPath);
		} catch {
			// didn't exist — that's fine
		}
		await symlink(relative(dirname(symlinkPath), agentsDir).replace(/\\/g, "/"), symlinkPath);

		installed.push(name);
	}

	const externalFailed: string[] = [];
	const externalStale: string[] = [];
	if (missing.length > 0) {
		let lock: SkillsLock | null = null;
		try {
			lock = JSON.parse(await readFile(join(skillsRoot, "skills-lock.json"), "utf8")) as SkillsLock;
		} catch {
			// No lock file or parse error — all missing remain unknown.
		}
		if (lock?.skills) {
			for (const name of [...missing]) {
				const entry = lock.skills[name];
				if (!entry) continue;
				try {
					const { content, stale: isStale } = await fetchExternalSkill(entry);
					const agentsDir = join(repoRoot, AGENTS_SKILLS_ROOT, name);
					await mkdir(agentsDir, { recursive: true });
					await writeFile(join(agentsDir, "SKILL.md"), content);
					const symlinkPath = join(repoRoot, symlinkFn(name));
					await mkdir(dirname(symlinkPath), { recursive: true });
					try {
						await unlink(symlinkPath);
					} catch {
						// didn't exist — that's fine
					}
					await symlink(relative(dirname(symlinkPath), agentsDir).replace(/\\/g, "/"), symlinkPath);
					missing.splice(missing.indexOf(name), 1);
					installed.push(name);
					if (isStale) externalStale.push(name);
				} catch {
					missing.splice(missing.indexOf(name), 1);
					externalFailed.push(name);
				}
			}
		}
	}

	if (installed.length > 0 || stale.length > 0 || missing.length > 0 || externalFailed.length > 0) {
		await updateSkillsGitignore(gitignorePath, [...installed, ...missing, ...externalFailed], symlinkFn);
	}

	const parts: string[] = [`installed ${installed.length}`];
	if (stale.length > 0) parts.push(`pruned: ${stale.join(", ")}`);
	if (externalStale.length > 0)
		parts.push(`stale: ${externalStale.join(", ")} (run \`holocron skills update\` to refresh)`);
	if (externalFailed.length > 0) parts.push(`fetch failed: ${externalFailed.join(", ")}`);
	if (missing.length > 0) parts.push(`unknown: ${missing.join(", ")}`);
	return parts.join("; ");
}

/**
 * The skill names a previous `holocron setup` recorded in the `.gitignore`
 * managed block. A block missing its end marker (hand-edited, truncated) runs
 * only to the next blank line — the same rule `updateGitignore` uses to
 * replace it — so user-written ignore rules further down are never mistaken
 * for installed skills and pruned.
 */
export function parsePreviousSkills(gitignoreContent: string, symlinkFn: (n: string) => string): string[] {
	const startIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_START);
	if (startIdx === -1) return [];
	const endIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_END, startIdx);
	const blankAt = /\r?\n[ \t]*\r?\n/.exec(gitignoreContent.slice(startIdx));
	const blankIdx = blankAt ? startIdx + blankAt.index : -1;
	// Complete only if the end marker comes before any blank line.
	const complete = endIdx !== -1 && (blankIdx === -1 || endIdx < blankIdx);
	const blockEnd = complete ? endIdx : blankIdx === -1 ? gitignoreContent.length : blankIdx;
	const block = gitignoreContent.slice(startIdx, blockEnd);
	const placeholder = "__placeholder__";
	const symlinkPrefix = `/${symlinkFn(placeholder)}`.replace(placeholder, "");
	return block
		.split(/\r?\n/)
		.filter((line) => line.startsWith(symlinkPrefix))
		.map((line) => line.slice(symlinkPrefix.length));
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDirRecursive(srcPath, destPath);
		} else {
			await copyFile(srcPath, destPath);
		}
	}
}

async function updateSkillsGitignore(
	gitignorePath: string,
	skills: string[],
	symlinkFn: (name: string) => string
): Promise<void> {
	await updateGitignore(gitignorePath, {
		start: GITIGNORE_BLOCK_START,
		end: GITIGNORE_BLOCK_END,
		lines: [`/${AGENTS_SKILLS_ROOT}/`, ...skills.map((n) => `/${symlinkFn(n)}`)],
	});
}
