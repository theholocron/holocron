/**
 * Lints a PR's own changed markdown files against this org's canonical
 * markdownlint config — the fourth Bucket 1 static-analysis check
 * (holocron#769/#821), same config-free, no-checkout architecture alex
 * (#793) and prettier (#819) already proved out twice.
 *
 * D1-equivalent: real `markdownlint` (`lint()` from `markdownlint/promise`),
 * the exact same programmatic API a local `markdownlint-cli2` invocation
 * uses internally — never a reimplementation of its rules.
 *
 * `fixes` (consumed by `commit-markdown-lint-fix.ts`): markdownlint's own
 * `applyFixes(content, errors)` — the same deterministic-fix mechanism
 * `markdownlint-cli2 --fix` runs internally — applied per file against the
 * same `errors` array `lint()` already returned, since each error already
 * carries its own rule's `fixInfo` (`null` when that rule has no
 * deterministic fix, e.g. MD001 heading-increment: there's no single
 * correct heading level to guess at). No separate pass, no reimplemented
 * fix logic — `applyFixes()` already decides per-finding whether it's
 * safe to apply, the same "never guess, only fix the unambiguous part"
 * boundary `lint-editorconfig.ts`'s own `indent_style` handling draws by
 * hand for a tool with no such built-in mechanism.
 *
 * Config: this org's canonical `@theholocron/markdownlint-config` default
 * export — already one canonical, importable config (same "one config, not
 * N copies" reasoning `@theholocron/prettier-config`/`ALEX_CONFIG`/
 * `@theholocron/commitlint-config` all established), not fetched per-repo.
 * Ignore list: reuses `ALEX_IGNORE_PATTERNS` (`@theholocron/cli`) — same
 * markdown-only scope and the same reasons those files aren't worth
 * linting (machine-generated `CHANGELOG.md`, no-prose `LICENSE`,
 * boilerplate `.github/*` templates) apply equally to markdownlint's
 * structural rules as they do to alex's prose rules.
 *
 * Security boundary (D6-amended, same as `lint-inclusive-language.ts`/
 * `lint-formatting.ts`): reads each changed file's content on the PR's own
 * head ref via `GitHubClient.git.getContents(repo, path, ref)` — a
 * same-repo PR branch, not a fork's.
 *
 * One `lint()` call for every candidate file's content of one config (two calls at most: `.md` and `.mdx`), not a per-file
 * loop — `markdownlint`'s own `strings` option is designed to batch-lint
 * multiple named contents in a single call, returning results keyed by
 * the same names given (`LintResults`); every content fetch is still one
 * `getContents()` call per file (GitHub's Contents API has no batch-read),
 * but the actual lint pass itself doesn't need to run once per file the
 * way `prettier.check()`/`alex.markdown()` do.
 */

import { ALEX_IGNORE_PATTERNS } from "@theholocron/astromech/lint";
import MARKDOWNLINT_CONFIG from "@theholocron/markdownlint-config";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";

import { decodeContents, isIgnored } from "../../../utils/index.js";
import type {
	LintMarkdownInput,
	LintMarkdownResult,
	MarkdownLintFix,
	MarkdownLintMessage,
} from "./lint-markdown.type.js";

const MARKDOWN_EXTENSIONS = [".md", ".mdx"];

/**
 * The config for an `.mdx` file: the org's, without `no-space-in-emphasis` (MD037). markdownlint parses Markdown and
 * not MDX, so it reads JSX such as `{/* a comment *\/}` as emphasis with spaces inside, and its fix strips the spaces
 * that prettier's MDX formatting puts back: on #1949 the two fixers committed 34 times undoing each other
 * (holocron#1950). Every other rule still applies to an `.mdx` file; add to this list only a rule that is shown to
 * misread MDX the same way.
 */
const MDX_CONFIG = { ...MARKDOWNLINT_CONFIG, "no-space-in-emphasis": false };

export async function lintMarkdown(input: LintMarkdownInput): Promise<LintMarkdownResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) =>
			f.status !== "removed" &&
			MARKDOWN_EXTENSIONS.some((ext) => f.filename.endsWith(ext)) &&
			!isIgnored(f.filename, ALEX_IGNORE_PATTERNS)
	);

	const strings: Record<string, string> = {};
	for (const target of targets) {
		const contents = await client.git.getContents(repo, target.filename, ref);
		strings[target.filename] = decodeContents(contents.content);
	}

	// One `lint()` call per config: `.md` files with the org's, `.mdx` files with it minus the rule above.
	const names = Object.keys(strings);
	const pick = (wanted: string[]) => Object.fromEntries(wanted.map((name) => [name, strings[name]!]));
	const [md, mdx] = [names.filter((n) => !n.endsWith(".mdx")), names.filter((n) => n.endsWith(".mdx"))];
	const results = {
		...(md.length > 0 ? await lint({ config: MARKDOWNLINT_CONFIG, strings: pick(md) }) : {}),
		...(mdx.length > 0 ? await lint({ config: MDX_CONFIG, strings: pick(mdx) }) : {}),
	};

	const messages: MarkdownLintMessage[] = [];
	const fixes: MarkdownLintFix[] = [];
	for (const [file, errors] of Object.entries(results)) {
		if (errors.length === 0) continue;

		for (const e of errors) {
			messages.push({
				file,
				line: e.lineNumber,
				ruleNames: e.ruleNames,
				reason: e.ruleDescription,
				errorRange: e.errorRange,
				severity: e.severity,
			});
		}

		const fixed = applyFixes(strings[file]!, errors);
		if (fixed !== strings[file]) fixes.push({ file, fixed });
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages, fixes };
}
