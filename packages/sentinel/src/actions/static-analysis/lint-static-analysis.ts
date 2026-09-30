/**
 * Lints a PR's own changed JS/TS files against this org's canonical eslint
 * config — the fifth Bucket 1 static-analysis check (holocron#769/#849),
 * same config-free-per-repo, no-checkout architecture alex (#793), prettier
 * (#819), and markdownlint (#821) already proved out three times.
 *
 * D1-equivalent: real `eslint` (`Linter.verify()`), the exact same
 * programmatic API a local `eslint .` invocation uses internally — never a
 * reimplementation of its rules. Confirmed live that this needs no checkout:
 * `Linter.verify()` never touches the filesystem for anything the shared
 * bundles' own rules do — no type-aware rules exist in any bundle today
 * (`typescript()` uses `tseslint.configs.recommended`, not
 * `recommendedTypeChecked`) and the one rule that would need real
 * cross-file resolution to run in-memory (`n/no-missing-import`) is already
 * turned off org-wide in `node()`'s config, predating this check entirely.
 *
 * Unlike its four siblings, this check is **not** config-free — it needs
 * `holocron.config.ts`'s `repo.properties.runtime_environment` to decide
 * whether eslint even applies to this repo at all (a docs-only repo has no
 * JS/TS to lint), the one thing `handler.ts`'s caller must resolve before
 * invoking this at all. `library()` is the only bundle wired in today — the
 * org-wide default for every currently-migrated repo (matches
 * `resolver.ts`'s own `TOOL_CONFIGS` stance); a `holocron_profile`-driven
 * bundle switch (`react-app()`/`node-app()`/`next-app()`) is a real,
 * deliberately deferred follow-up once a non-`library`-profiled repo
 * actually needs this check (holocron#849's own scope).
 *
 * `browserPackages` (optional, from `holocron.config.ts`'s own `eslint`
 * field) is the one `library()` option this check does honor — the same
 * option a package's own `eslint.config.ts` passes locally for a deliberate
 * Web-globals outlier (e.g. `github-client`'s Web Crypto usage). This check
 * never reads a PR's own committed files for config (Bucket 1's whole
 * design boundary), so `holocron.config.ts`'s declared `eslint.browserPackages`
 * is the source of truth it reads instead — without it, this check would
 * flag a false-positive `eslint-plugin-n` node-builtins-compat warning on
 * exactly the files the local config exists to exempt.
 *
 * Security boundary (D6-amended, same as `lint-formatting.ts`/
 * `lint-markdown.ts`): reads each changed file's content on the PR's own
 * head ref via `GitHubClient.git.getContents(repo, path, ref)` — a
 * same-repo PR branch, not a fork's.
 */

import { library } from "@theholocron/eslint-config/bundles/library";
import type { GitHubClient } from "@theholocron/github-client";
import { Linter } from "eslint";

import { decodeContents } from "../../utils/decode-contents.js";

const LINTABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const DEFAULT_CONFIG = library();

export interface LintStaticAnalysisInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
	/** Repo-root-relative directories — `holocron.config.ts`'s `eslint.browserPackages`, passed through unchanged to `library()`. */
	browserPackages?: string[];
}

export interface StaticAnalysisMessage {
	file: string;
	/** 1-indexed — eslint's own `Linter.LintMessage.line`, populated even for a parse error. */
	line: number;
	column: number;
	/** `null` for a parse error — eslint's own `Linter.LintMessage.ruleId` shape, not a rule violation. */
	ruleId: string | null;
	reason: string;
	severity: "error" | "warning";
}

export interface LintStaticAnalysisResult {
	valid: boolean;
	fileCount: number;
	messages: StaticAnalysisMessage[];
}

const linter = new Linter();

export async function lintStaticAnalysis(input: LintStaticAnalysisInput): Promise<LintStaticAnalysisResult> {
	const { client, repo, pullNumber, ref, browserPackages } = input;
	const config = browserPackages && browserPackages.length > 0 ? library({ browserPackages }) : DEFAULT_CONFIG;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) => f.status !== "removed" && LINTABLE_EXTENSIONS.some((ext) => f.filename.endsWith(ext))
	);

	const messages: StaticAnalysisMessage[] = [];
	for (const target of targets) {
		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		const results = linter.verify(text, config, { filename: target.filename });
		for (const m of results) {
			messages.push({
				file: target.filename,
				line: m.line,
				column: m.column,
				ruleId: m.ruleId,
				reason: m.message,
				severity: m.severity === 2 ? "error" : "warning",
			});
		}
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages };
}
