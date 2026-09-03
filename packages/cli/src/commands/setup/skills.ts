import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

interface SkillLockEntry {
	source: string;
	sourceType: "github";
	skillPath: string;
	computedHash?: string;
}

interface SkillsLock {
	version: number;
	skills: Record<string, SkillLockEntry>;
}

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
		const result = spawnSync("pnpm", ["add", "-D", "@theholocron/skills"], {
			cwd: repoRoot,
			stdio: "inherit",
		});
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
		await updateSkillsGitignore(
			gitignorePath,
			existingContent,
			[...installed, ...missing, ...externalFailed],
			symlinkFn
		);
	}

	const parts: string[] = [`installed ${installed.length}`];
	if (stale.length > 0) parts.push(`pruned: ${stale.join(", ")}`);
	if (externalStale.length > 0)
		parts.push(`stale: ${externalStale.join(", ")} (run \`holocron skills update\` to refresh)`);
	if (externalFailed.length > 0) parts.push(`fetch failed: ${externalFailed.join(", ")}`);
	if (missing.length > 0) parts.push(`unknown: ${missing.join(", ")}`);
	return parts.join("; ");
}

export function parsePreviousSkills(gitignoreContent: string, symlinkFn: (n: string) => string): string[] {
	if (!gitignoreContent.includes(GITIGNORE_BLOCK_START)) return [];
	const startIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_START);
	const endIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_END, startIdx);
	const block = endIdx !== -1 ? gitignoreContent.slice(startIdx, endIdx) : gitignoreContent.slice(startIdx);
	const placeholder = "__placeholder__";
	const symlinkPrefix = `/${symlinkFn(placeholder)}`.replace(placeholder, "");
	return block
		.split("\n")
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
	existingContent: string,
	skills: string[],
	symlinkFn: (name: string) => string
): Promise<void> {
	const entries = [`/${AGENTS_SKILLS_ROOT}/`, ...skills.map((n) => `/${symlinkFn(n)}`)];
	const block = [GITIGNORE_BLOCK_START, ...entries, GITIGNORE_BLOCK_END].join("\n");

	let content: string;
	if (existingContent.includes(GITIGNORE_BLOCK_START)) {
		const start = existingContent.indexOf(GITIGNORE_BLOCK_START);
		const end = existingContent.indexOf(GITIGNORE_BLOCK_END, start);
		const afterBlock = end !== -1 ? existingContent.slice(end + GITIGNORE_BLOCK_END.length) : "\n";
		content = existingContent.slice(0, start) + block + afterBlock;
	} else {
		content = (existingContent.trimEnd() ? existingContent.trimEnd() + "\n\n" : "") + block + "\n";
	}

	await writeFile(gitignorePath, content, "utf8");
}
