/**
 * `holocron new <type> <name>` — create a GitHub repo from a template and
 * bootstrap it by replacing all template-slug casing variants with the new
 * project name.
 *
 * Flow:
 *   1. Preflight — verify `gh` CLI is available.
 *   2. Resolve type, name, description (prompt via readline if missing).
 *   3. `gh repo create <org>/<name> --template <org>/<type>-template --private --clone`
 *      → clones to `<cwd>/<name>/`
 *   4. Detect template slug from cloned package.json.
 *   5. Replace all casing variants of the slug across every text file.
 *   6. Replace `<description>` placeholder if a description was given.
 *   7. Commit the patched files (-s for DCO).
 *   8. Unless --no-verify: `pnpm install` in the new repo.
 *   9. Print next steps.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── Public API ────────────────────────────────────────────────────────

export interface RunNewInput {
	type: string;
	name: string;
	description?: string;
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
				templateSlug = pkg.name.split("/").pop() ?? templateSlug;
			}
		} catch {
			// fall back to derived slug
		}
	}

	print(`  Detected template slug: ${templateSlug}`);
	print(`  Patching files…`);

	const variants = deriveVariants(templateSlug, input.name);
	const filesPatched = patchFiles(repoDir, variants, input.description, print, readFn, writeFn, walkFn);

	print(`  ${filesPatched.length} file${filesPatched.length === 1 ? "" : "s"} patched`);

	if (filesPatched.length > 0) {
		execFn("git", ["add", "-A"], { cwd: repoDir, stdio: "inherit" });
		execFn("git", ["commit", "-s", "-m", `chore: bootstrap from ${templateSlug}`], {
			cwd: repoDir,
			stdio: "inherit",
		});
	}

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
	}

	print("");
	print(`  Scaffolded ${newRepo} (${filesPatched.length} file${filesPatched.length === 1 ? "" : "s"} patched).`);
	print("");
	print("  Next:");
	print(`    1. cd ${repoDir}`);
	if (input.noVerify) print(`    2. pnpm install`);
	const step = input.noVerify ? 3 : 2;
	print(`    ${step}. holocron setup  # wire up secrets, teams, labels, etc.`);
	print(`    ${step + 1}. git push -u origin HEAD`);

	return { status: "ok", repoDir, filesPatched };
}
