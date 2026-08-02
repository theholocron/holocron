/**
 * `holocron new <type> <name>` — create a GitHub repo from a template and
 * bootstrap it by replacing all template-slug casing variants with the new
 * project name, then generate a `holocron.config.ts` from the answers given
 * during the interactive wizard.
 *
 * Flow:
 *   1. Preflight — verify `gh` CLI is available.
 *   2. Resolve type, name, description, homepage, vault/deployment/agent options.
 *   3. `gh repo create <org>/<name> --template <org>/<type>-template --private --clone`
 *      → clones to `<cwd>/<name>/`
 *   4. Detect template slug from cloned package.json.
 *   5. Replace all casing variants of the slug across every text file.
 *   6. Replace `<description>` and `<homepage>` placeholders.
 *   7. Generate and write `holocron.config.ts` based on wizard answers.
 *   8. Commit the patched files (-s for DCO).
 *   9. Unless --no-verify: `pnpm install` in the new repo.
 *  10. Print next steps.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── Public API ────────────────────────────────────────────────────────

export type VaultProvider = "doppler" | "1password" | "infisical" | "none";
export type DeploymentProvider = "vercel" | "none";
export type AgentChoice = "claude" | "none";

export interface RunNewInput {
	type: string;
	name: string;
	description?: string;
	homepage?: string;
	vaultProvider?: VaultProvider;
	vaultProject?: string;
	vaultConfig?: string;
	deploymentProvider?: DeploymentProvider;
	agent?: AgentChoice;
	topics?: string[];
	/** GitHub org that owns both the template and the new repo. Default: "theholocron". */
	org?: string;
	dryRun?: boolean;
	noVerify?: boolean;
	/** Parent directory where the repo will be cloned. Default: process.cwd(). */
	cwd?: string;
	print?: (line: string) => void;
	/** Injectable subprocess runner for testing. */
	exec?: (cmd: string, args: string[], opts: { cwd: string; stdio: "inherit" }) => void;
	/** Injectable file writer for testing. */
	writeFile?: (filepath: string, content: string) => void;
	/** Injectable file reader for testing (returns utf-8 string). */
	readFile?: (filepath: string) => string;
	/** Injectable directory walker for testing (returns absolute paths). */
	walkFiles?: (dir: string) => string[];
}

export interface NewReport {
	status: "ok" | "fail" | "dry-run";
	repoDir?: string;
	filesPatched?: string[];
	message?: string;
}

export class NewError extends Error {
	override name = "NewError";
}

// ── Case derivation ───────────────────────────────────────────────────

function cap(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Derive all common casing variants of a kebab-case slug (e.g.
 * "cli-template") and map each to the corresponding form of a
 * kebab-case name (e.g. "my-tool").
 *
 * Returns search→replacement pairs, deduplicating single-word slugs
 * that would otherwise produce identical entries.
 */
export function deriveVariants(slug: string, name: string): Array<[string, string]> {
	const sw = slug.split("-");
	const nw = name.split("-");

	const pairs: Array<[string, string]> = [
		[slug, name],
		[sw.join("_"), nw.join("_")],
		[sw.join("_").toUpperCase(), nw.join("_").toUpperCase()],
		[sw.map(cap).join(""), nw.map(cap).join("")],
		[sw[0]!.toLowerCase() + sw.slice(1).map(cap).join(""), nw[0]!.toLowerCase() + nw.slice(1).map(cap).join("")],
		[sw.map(cap).join(" "), nw.map(cap).join(" ")],
	];

	const seen = new Set<string>();
	return pairs.filter(([s]) => {
		if (seen.has(s)) return false;
		seen.add(s);
		return true;
	});
}

// ── Input helpers ─────────────────────────────────────────────────────

/** Validate a repo name: must be lowercase kebab-case. Returns `true` on success or an error string. */
export function validateRepoName(v: string): true | string {
	return /^[a-z][a-z0-9-]*$/.test(v.trim()) ? true : "Must be lowercase kebab-case (e.g. my-tool)";
}

/** Parse a comma-separated topics string into a trimmed, non-empty array. */
export function parseTopics(raw: string | undefined): string[] {
	return raw ? String(raw).split(",").map((t) => t.trim()).filter(Boolean) : [];
}

// ── Config generation ─────────────────────────────────────────────────

export interface HolocronConfigOptions {
	name: string;
	type: string;
	description?: string;
	homepage?: string;
	vaultProvider?: VaultProvider;
	vaultProject?: string;
	vaultConfig?: string;
	deploymentProvider?: DeploymentProvider;
	agent?: AgentChoice;
	topics?: string[];
}

/**
 * Generate the content of `holocron.config.ts` for a newly-scaffolded repo.
 * Uses the `node()` preset from `@theholocron/holocron-config` as the baseline
 * and layers in the provider/agent choices made during the wizard.
 */
export function generateHolocronConfig(opts: HolocronConfigOptions): string {
	const lines: string[] = [
		`import { defineConfig } from "@theholocron/cli";`,
		`import { node } from "@theholocron/holocron-config";`,
		``,
		`const { repo, workflows, providers } = node();`,
		`export default defineConfig({`,
	];

	if (opts.description) lines.push(`\tdescription: ${JSON.stringify(opts.description)},`);
	if (opts.homepage) lines.push(`\thomepage: ${JSON.stringify(opts.homepage)},`);

	const topics = opts.topics?.length ? opts.topics : [];
	if (topics.length > 0) {
		lines.push(`\trepo: {`);
		lines.push(`\t\ttopics: ${JSON.stringify(topics)},`);
		lines.push(`\t\t...repo,`);
		lines.push(`\t},`);
	} else {
		lines.push(`\trepo,`);
	}

	lines.push(`\tworkflows,`);

	const hasVault = opts.vaultProvider && opts.vaultProvider !== "none";
	const hasDeployment = opts.deploymentProvider && opts.deploymentProvider !== "none";

	if (hasVault || hasDeployment) {
		lines.push(`\tproviders: {`);
		lines.push(`\t\t...providers,`);
		if (opts.vaultProvider === "doppler") {
			const proj = JSON.stringify(opts.vaultProject ?? opts.name);
			const cfg = JSON.stringify(opts.vaultConfig ?? "dev");
			lines.push(`\t\tvault: ["doppler", { project: ${proj}, config: ${cfg} }],`);
		} else if (opts.vaultProvider === "1password") {
			const vault = JSON.stringify(opts.vaultProject ?? opts.name);
			lines.push(`\t\tvault: ["1password", { vault: ${vault} }],`);
		} else if (opts.vaultProvider === "infisical") {
			const proj = JSON.stringify(opts.vaultProject ?? opts.name);
			lines.push(`\t\tvault: ["infisical", { project: ${proj} }],`);
		}
		if (opts.deploymentProvider === "vercel") {
			lines.push(`\t\tdeployment: "vercel",`);
		}
		lines.push(`\t},`);
	} else {
		lines.push(`\tproviders,`);
	}

	if (opts.agent && opts.agent !== "none") {
		lines.push(`\tagent: ${JSON.stringify(opts.agent)},`);
	}

	lines.push(`});`);
	lines.push(``);

	return lines.join("\n");
}

// ── File discovery ────────────────────────────────────────────────────

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".turbo"]);

function defaultWalkFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) continue;
		const full = path.join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) results.push(...defaultWalkFiles(full));
		else if (stat.isFile()) results.push(full);
	}
	return results;
}

function isBinary(content: string): boolean {
	for (let i = 0; i < Math.min(content.length, 8000); i++) {
		if (content.charCodeAt(i) === 0) return true;
	}
	return false;
}

// ── Patching ──────────────────────────────────────────────────────────

function patchFiles(
	dir: string,
	variants: Array<[string, string]>,
	description: string | undefined,
	homepage: string | undefined,
	print: (line: string) => void,
	readFn: (p: string) => string,
	writeFn: (p: string, c: string) => void,
	walkFn: (d: string) => string[]
): string[] {
	const patched: string[] = [];
	for (const filepath of walkFn(dir)) {
		let content: string;
		try {
			content = readFn(filepath);
		} catch {
			continue;
		}
		if (isBinary(content)) continue;

		const original = content;
		for (const [search, replacement] of variants) {
			content = content.split(search).join(replacement);
		}
		if (description !== undefined) {
			content = content.split("<description>").join(description);
		}
		if (homepage !== undefined) {
			content = content.split("<homepage>").join(homepage);
		}

		if (content !== original) {
			writeFn(filepath, content);
			print(`  ✓ ${path.relative(dir, filepath)}`);
			patched.push(filepath);
		}
	}
	return patched;
}

// ── Preflight ─────────────────────────────────────────────────────────

function preflight(): void {
	const result = spawnSync("gh", ["--version"], { encoding: "utf8" });
	if (result.error != null || result.status !== 0) {
		throw new NewError("`gh` CLI is not installed or not on PATH. Install it from https://cli.github.com");
	}
}

// ── Defaults ──────────────────────────────────────────────────────────

function defaultExec(cmd: string, args: string[], opts: { cwd: string; stdio: "inherit" }): void {
	execFileSync(cmd, args, { cwd: opts.cwd, stdio: opts.stdio });
}

function defaultReadFile(filepath: string): string {
	return readFileSync(filepath, "utf-8");
}

function defaultWriteFile(filepath: string, content: string): void {
	mkdirSync(path.dirname(filepath), { recursive: true });
	writeFileSync(filepath, content, "utf-8");
}

// ── Orchestrator ──────────────────────────────────────────────────────

export async function runNew(input: RunNewInput): Promise<NewReport> {
	const cwd = input.cwd ?? process.cwd();
	const org = input.org ?? "theholocron";
	const print = input.print ?? ((line: string) => console.log(line));
	const execFn = input.exec ?? defaultExec;
	const readFn = input.readFile ?? defaultReadFile;
	const writeFn = input.writeFile ?? defaultWriteFile;
	const walkFn = input.walkFiles ?? defaultWalkFiles;

	preflight();

	const templateRepo = `${org}/${input.type}-template`;
	const newRepo = `${org}/${input.name}`;
	const repoDir = path.join(cwd, input.name);

	if (input.dryRun) {
		print(`  Would create ${newRepo} from template ${templateRepo}`);
		print(`  Would clone to ${repoDir}`);
		print(`  Would patch all casing variants of "${input.type}-template" → "${input.name}"`);
		if (input.description) print(`  Would replace <description> → "${input.description}"`);
		if (input.homepage) print(`  Would replace <homepage> → "${input.homepage}"`);
		print(`  Would generate holocron.config.ts`);
		return { status: "dry-run" };
	}

	if (existsSync(repoDir)) {
		throw new NewError(`\`${repoDir}\` already exists — delete it or pick a different name.`);
	}

	print(`  Creating ${newRepo} from template ${templateRepo}…`);
	try {
		execFn("gh", ["repo", "create", newRepo, `--template=${templateRepo}`, "--private", "--clone"], {
			cwd,
			stdio: "inherit",
		});
	} catch (err) {
		throw new NewError(`gh repo create failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Detect template slug from cloned package.json
	let templateSlug = `${input.type}-template`;
	const pkgJsonPath = path.join(repoDir, "package.json");
	if (existsSync(pkgJsonPath)) {
		try {
			const pkg = JSON.parse(readFn(pkgJsonPath)) as { name?: string };
			if (typeof pkg.name === "string") {
				templateSlug = pkg.name.split("/").at(-1) || templateSlug;
			}
		} catch {
			// fall back to derived slug
		}
	}

	print(`  Detected template slug: ${templateSlug}`);
	print(`  Patching files…`);

	const variants = deriveVariants(templateSlug, input.name);
	const filesPatched = patchFiles(
		repoDir,
		variants,
		input.description,
		input.homepage,
		print,
		readFn,
		writeFn,
		walkFn
	);

	print(`  ${filesPatched.length} file${filesPatched.length === 1 ? "" : "s"} patched`);

	// Generate and write holocron.config.ts
	const configContent = generateHolocronConfig({
		name: input.name,
		type: input.type,
		description: input.description,
		homepage: input.homepage,
		vaultProvider: input.vaultProvider,
		vaultProject: input.vaultProject,
		vaultConfig: input.vaultConfig,
		deploymentProvider: input.deploymentProvider,
		agent: input.agent,
		topics: input.topics,
	});
	const configPath = path.join(repoDir, "holocron.config.ts");
	writeFn(configPath, configContent);
	print(`  Generated holocron.config.ts`);

	execFn("git", ["add", "-A"], { cwd: repoDir, stdio: "inherit" });
	execFn("git", ["commit", "-s", "-m", `chore: bootstrap from ${templateSlug}`], {
		cwd: repoDir,
		stdio: "inherit",
	});

	if (!input.noVerify) {
		print("");
		print("  Installing dependencies…");
		try {
			execFn("pnpm", ["install"], { cwd: repoDir, stdio: "inherit" });
		} catch (err) {
			print(`  ✗ pnpm install failed — ${err instanceof Error ? err.message : String(err)}`);
			return {
				status: "fail",
				repoDir,
				filesPatched,
				message: "pnpm install failed; inspect output above",
			};
		}

		print("");
		print("  Running holocron setup…");
		try {
			execFn("holocron", ["setup"], { cwd: repoDir, stdio: "inherit" });
		} catch {
			print("  ✗ holocron setup failed — run it manually after checking your config");
		}
	}

	print("");
	print(`  Scaffolded ${newRepo} (${filesPatched.length} file${filesPatched.length === 1 ? "" : "s"} patched).`);
	print("");
	print("  Next:");
	print(`    1. cd ${repoDir}`);
	if (input.noVerify) {
		print(`    2. pnpm install`);
		print(`    3. holocron setup  # wire up secrets, teams, labels, etc.`);
		print(`    4. git push -u origin HEAD`);
	} else {
		print(`    2. git push -u origin HEAD`);
	}

	return { status: "ok", repoDir, filesPatched };
}
