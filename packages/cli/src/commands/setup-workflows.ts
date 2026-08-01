/**
 * Thin workflow wrapper templates for `holocron setup`.
 *
 * Each entry is a complete `.github/workflows/<name>.yml` that delegates
 * to the corresponding reusable `ci-<name>.yml` in `theholocron/.github`.
 * Files are overwritten on each setup run — they are generated artifacts.
 */

export { default as DEPENDABOT_CONFIG } from "./dependabot.yml";

import auditYml from "./workflows/audit.yml";
import bookkeepingYml from "./workflows/bookkeeping.yml";
import codeqlYml from "./workflows/codeql.yml";
import dependenciesYml from "./workflows/dependencies.yml";
import deployDocsYml from "./workflows/deploy-docs.yml";
import greetingsYml from "./workflows/greetings.yml";
import lintYml from "./workflows/lint.yml";
import releaseYml from "./workflows/release.yml";
import reviewYml from "./workflows/review.yml";
import staleYml from "./workflows/stale.yml";
import testYml from "./workflows/test.yml";
import typecheckYml from "./workflows/typecheck.yml";

/** Header prepended when holocron setup writes a generated file to a repo. */
export function workflowHeader(source = "packages/cli/src/commands/setup-workflows.ts"): string {
	return [
		`# AUTO-GENERATED — do not edit directly.`,
		`# Source:  theholocron/holocron · ${source}`,
		`# Tool:    holocron setup`,
		`# Changes: run \`holocron setup\` to regenerate.`,
		``,
	].join("\n");
}

export const WORKFLOW_TEMPLATES: Record<string, string> = {
	lint: lintYml,
	test: testYml,
	typecheck: typecheckYml,
	codeql: codeqlYml,
	review: reviewYml,
	release: releaseYml,
	stale: staleYml,
	greetings: greetingsYml,
	dependencies: dependenciesYml,
	bookkeeping: bookkeepingYml,
	audit: auditYml,
	"deploy-docs": deployDocsYml,
};

export const KNOWN_WORKFLOWS = new Set(Object.keys(WORKFLOW_TEMPLATES));

/**
 * GitHub check context name each CI workflow produces on a PR.
 *
 * The format is "{caller-workflow-name} / {reusable-job-name}". The caller
 * job's own `name:` field does NOT appear in the external check name — only
 * the calling workflow's top-level `name:` and the inner reusable-workflow
 * job name matter. Only workflows that gate merges are listed here.
 */
export const WORKFLOW_CHECK_CONTEXTS: Partial<Record<string, string>> = {
	lint: "Lint / Lint entire codebase",
	test: "Test / Run tests and collect coverage",
	typecheck: "Typecheck / tsc --noEmit",
};

/**
 * Generate the thin caller content for a workflow, optionally injecting or
 * merging `with:` overrides into the jobs block.
 *
 * Two strategies are used depending on the template:
 * - Templates that already have a `with:` block (e.g. lint):
 *   the override entries are merged in, replacing existing keys and appending
 *   new ones.
 * - Templates that end with `    secrets: inherit`: a new `with:` block is
 *   injected immediately before `secrets: inherit`.
 * If neither pattern matches the template, a warning is emitted and the
 * base template is returned unchanged.
 */
export function generateThinCallerContent(
	name: string,
	withOverrides?: Record<string, unknown>,
	additionalPaths?: string[]
): string {
	const base = WORKFLOW_TEMPLATES[name];
	if (!base) return "";

	const fmt = (k: string, v: unknown) => `      ${k}: ${v === true ? "true" : v === false ? "false" : String(v)}`;

	let result = base;

	// Append extra push.paths entries after the existing paths: block.
	if (additionalPaths && additionalPaths.length > 0) {
		const pathsBlockRe = /( {4}paths:\n)((?:[ ]{6}- [^\n]+\n)+)/;
		const newEntries = additionalPaths.map((p) => `      - ${p}\n`).join("");
		result = result.replace(pathsBlockRe, (_, header, existing) => header + existing + newEntries);
	}

	if (!withOverrides || Object.keys(withOverrides).length === 0) return result;

	// If the template already has a with: block, merge overrides into it.
	// Existing keys are replaced; new keys are appended.
	const withBlockRe = /( {4}with:\n)((?:[ ]{6}[^\n]+\n)*)/;
	const existingMatch = result.match(withBlockRe);
	if (existingMatch) {
		const existingEntries = new Map(
			existingMatch[2]
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const m = line.match(/^ {6}([^:]+):\s*(.*)/);
					return m ? ([m[1].trim(), m[2].trim()] as [string, string]) : null;
				})
				.filter((e): e is [string, string] => e !== null)
		);
		for (const [k, v] of Object.entries(withOverrides)) {
			existingEntries.set(k, v === true ? "true" : v === false ? "false" : String(v));
		}
		const merged = [...existingEntries.entries()].map(([k, v]) => `      ${k}: ${v}`).join("\n");
		return result.replace(withBlockRe, `    with:\n${merged}\n`);
	}

	// No existing with: block — inject before `    secrets: inherit` at end.
	const withBlock = Object.entries(withOverrides)
		.map(([k, v]) => fmt(k, v))
		.join("\n");
	const injected = result.replace(/ {4}secrets: inherit\n$/, `    with:\n${withBlock}\n    secrets: inherit\n`);
	if (injected === result) {
		console.warn(`[generateThinCallerContent] could not inject with: overrides into "${name}" template`);
	}
	return injected;
}
