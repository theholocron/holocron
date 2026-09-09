/**
 * Workflow templates + thin-caller generation.
 *
 * `WORKFLOW_TEMPLATES` holds each reusable `.github/workflows/<name>.yml`
 * (synced to `theholocron/.github`); `generateThinCallerContent` wraps one
 * into the thin caller `holocron setup` / `holocron sync` write locally.
 */

import auditYml from "./templates/workflows/audit.yml";
import bookkeepingYml from "./templates/workflows/bookkeeping.yml";
import dependenciesYml from "./templates/workflows/dependencies.yml";
import deployYml from "./templates/workflows/deploy.yml";
import greetingsYml from "./templates/workflows/greetings.yml";
import lintYml from "./templates/workflows/lint.yml";
import previewYml from "./templates/workflows/preview.yml";
import releaseYml from "./templates/workflows/release.yml";
import reviewYml from "./templates/workflows/review.yml";
import securityYml from "./templates/workflows/security.yml";
import staleYml from "./templates/workflows/stale.yml";
import syncYml from "./templates/workflows/sync.yml";
import testYml from "./templates/workflows/test.yml";
import typecheckYml from "./templates/workflows/typecheck.yml";
import wikiYml from "./templates/workflows/wiki.yml";

export const WORKFLOW_TEMPLATES: Record<string, string> = {
	lint: lintYml,
	test: testYml,
	typecheck: typecheckYml,
	security: securityYml,
	preview: previewYml,
	review: reviewYml,
	release: releaseYml,
	stale: staleYml,
	sync: syncYml,
	greetings: greetingsYml,
	dependencies: dependenciesYml,
	bookkeeping: bookkeepingYml,
	audit: auditYml,
	deploy: deployYml,
	wiki: wikiYml,
};

export const KNOWN_WORKFLOWS = new Set(Object.keys(WORKFLOW_TEMPLATES));

/**
 * The GitHub status-check context a `required` task contributes to branch
 * protection. Format: `"{workflow name} / {job name}"`.
 *
 * These name the **aggregate `Conclusion` job** (fan-in, `if: always()`), not
 * an individual inner job — `test` has several conditionally-run sub-jobs, so
 * `"Test / Conclusion"` is the only stable gate. Only merge-gating workflows
 * are listed. `astro.requiredChecks()` reads this for every `required` task.
 */
export const WORKFLOW_CHECK_CONTEXTS: Partial<Record<string, string>> = {
	lint: "Lint / Conclusion",
	test: "Test / Conclusion",
	typecheck: "Typecheck / Conclusion",
	audit: "audit / Conclusion",
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
	additionalPaths?: string[],
	/** Optional sink for the "could not inject `with:`" warning. */
	logger?: { warn(obj: Record<string, unknown>, msg: string): void },
	/**
	 * `with:` key → a `# comment` line rendered immediately above that entry.
	 * Only honored when injecting a fresh `with:` block (no template today
	 * ships one), which is the path `lint` takes.
	 */
	comments?: Record<string, string>
): string {
	const base = WORKFLOW_TEMPLATES[name];
	if (!base) return "";

	// YAML treats bare [ and { as sequence/mapping nodes; single-quote them so
	// values like JSON arrays are kept as strings.
	const yamlScalar = (v: unknown): string => {
		if (v === true) return "true";
		if (v === false) return "false";
		const s = String(v);
		return s.startsWith("[") || s.startsWith("{") ? `'${s}'` : s;
	};
	const fmt = (k: string, v: unknown) => {
		const line = `      ${k}: ${yamlScalar(v)}`;
		return comments?.[k] ? `      # ${comments[k]}\n${line}` : line;
	};

	let result = base;

	// Append extra push.paths entries after an existing paths: block (deduplicating), or
	// insert a fresh paths: block after `branches: [main]` when the template has none.
	if (additionalPaths && additionalPaths.length > 0) {
		const pathsBlockRe = /( {4}paths:\n)((?:[ ]{6}- [^\n]+\n)+)/;
		if (pathsBlockRe.test(result)) {
			result = result.replace(pathsBlockRe, (_, header, existing) => {
				const existingPaths = new Set([...existing.matchAll(/- (.+)/g)].map((m) => m[1]));
				const newEntries = additionalPaths
					.filter((p) => !existingPaths.has(p))
					.map((p) => `      - ${p}\n`)
					.join("");
				return header + existing + newEntries;
			});
		} else {
			const pathsBlock = `    paths:\n${additionalPaths.map((p) => `      - ${p}\n`).join("")}`;
			result = result.replace(/( {4}branches: \[main\]\n)/, `$1${pathsBlock}`);
		}
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
				.filter((line) => !line.trim().startsWith("#"))
				.map((line) => {
					const m = line.match(/^ {6}([^:]+):\s*(.*)/);
					return m ? ([m[1].trim(), m[2].trim()] as [string, string]) : null;
				})
				.filter((e): e is [string, string] => e !== null)
		);
		for (const [k, v] of Object.entries(withOverrides)) {
			existingEntries.set(k, yamlScalar(v));
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
		logger?.warn({ template: name }, "generateThinCallerContent: could not inject `with:` overrides");
	}
	return injected;
}

export interface PreviewConfig {
	/** Cloudflare Pages project name shared across all repos for previews. */
	project: string;
	/**
	 * Base domain for preview URLs (e.g. `"preview.theholocron.dev"`).
	 * When set, `holocron setup` automatically provisions:
	 * - Cloudflare Pages custom domain `*.<domain>` on the project
	 * - DNS wildcard CNAME `*.<domain>` → `<project>.pages.dev`
	 *
	 * Preview URLs resolve as `<repo>-pr-<n>.<domain>`.
	 */
	domain?: string;
}

/** Org-level context used to derive preview defaults from `preview: true`. */
export interface OrgContext {
	/** GitHub org name — becomes the prefix of the default project: `<org>-preview`. */
	org?: string;
	/** Org canonical domain — becomes `preview.<domain>` for the default preview domain. */
	domain?: string;
	/** Project name — injected as the `name` input to the deploy reusable when `docs: true`. */
	repoName?: string;
}

/**
 * Extract the Cloudflare Pages preview config from a deploy workflow's `with:` object.
 *
 * Accepts three forms:
 * - `preview: true` — derive both project and domain from org context
 * - `preview: { project: "..." }` — explicit project; domain derived from context if omitted
 * - `preview: { project: "...", domain: "..." }` — fully explicit
 *
 * Returns null when `preview:` is absent, false, or can't be resolved.
 */
export function extractPreviewConfig(raw: Record<string, unknown>, ctx: OrgContext = {}): PreviewConfig | null {
	const preview = raw["preview"];
	if (!preview) return null;

	// preview: true — derive both values from org context
	if (preview === true) {
		const project = ctx.org ? `${ctx.org}-preview` : null;
		const domain = ctx.domain ? `preview.${ctx.domain}` : undefined;
		if (!project) return null;
		return { project, ...(domain ? { domain } : {}) };
	}

	if (typeof preview !== "object") return null;
	const p = preview as Record<string, unknown>;

	const project =
		typeof p["project"] === "string" && p["project"] ? p["project"] : ctx.org ? `${ctx.org}-preview` : null;
	if (!project) return null;

	const domain =
		typeof p["domain"] === "string" && p["domain"] ? p["domain"] : ctx.domain ? `preview.${ctx.domain}` : undefined;

	return { project, ...(domain ? { domain } : {}) };
}

/**
 * Generate the full thin-caller YAML for a `deploy.yml` that handles both
 * production (push to main → GitHub Pages) and preview (pull_request →
 * Cloudflare Pages) in a single file.
 *
 * Both jobs receive the same docs/storybook `with:` inputs. If the per-repo
 * config supplies `cloudflare-project` it is forwarded; otherwise the reusable
 * falls back to the `CLOUDFLARE_PAGES_PROJECT` org variable — set that once and
 * all repos with a `deploy` workflow get previews without per-repo config.
 */
export function generateCombinedDeployContent(
	deployWith: Record<string, unknown>,
	paths: string[],
	preview: Pick<PreviewConfig, "project">
): string {
	const yamlScalar = (v: unknown): string => {
		if (v === true) return "true";
		if (v === false) return "false";
		const s = String(v);
		return s.startsWith("[") || s.startsWith("{") ? `'${s}'` : s;
	};
	const withLines = (entries: Record<string, unknown>) =>
		Object.entries(entries)
			.map(([k, v]) => `      ${k}: ${yamlScalar(v)}`)
			.join("\n");

	const pathsBlock = paths.length > 0 ? `    paths:\n${paths.map((p) => `      - ${p}\n`).join("")}` : "";

	const previewWith = { ...deployWith, "cloudflare-project": preview.project };

	const deployWithBlock = Object.keys(deployWith).length > 0 ? `    with:\n${withLines(deployWith)}\n` : "";
	// previewWith always has at least cloudflare-project, so the block is never empty.
	const previewWithBlock = `    with:\n${withLines(previewWith)}\n`;

	return [
		`name: Deploy`,
		``,
		`on: # yamllint disable-line rule:truthy`,
		`  push:`,
		`    branches: [main]`,
		...(pathsBlock ? [`${pathsBlock}`] : []),
		`  pull_request:`,
		`    branches: [main]`,
		`    types: [opened, synchronize, reopened, closed]`,
		...(pathsBlock ? [`${pathsBlock}`] : []),
		`  workflow_dispatch:`,
		``,
		`concurrency:`,
		`  group: $\{{ github.event_name == 'pull_request' && format('preview-{0}', github.event.pull_request.number) || 'pages' }}`,
		`  cancel-in-progress: $\{{ github.event_name == 'pull_request' && github.event.action != 'closed' }}`,
		``,
		`permissions:`,
		`  contents: read`,
		`  deployments: write`,
		`  pages: write`,
		`  id-token: write`,
		`  pull-requests: write`,
		``,
		`jobs:`,
		`  deploy:`,
		`    name: Deploy`,
		`    if: \${{ github.event_name != 'pull_request' }}`,
		`    uses: theholocron/.github/.github/workflows/deploy.yml@main`,
		...(deployWithBlock ? [deployWithBlock.trimEnd()] : []),
		`    secrets: inherit`,
		``,
		`  preview:`,
		`    name: Preview`,
		`    if: \${{ github.event_name == 'pull_request' }}`,
		`    uses: theholocron/.github/.github/workflows/preview.yml@main`,
		previewWithBlock.trimEnd(),
		`    secrets: inherit`,
		``,
	].join("\n");
}

/**
 * Expand structured with-values to flat GitHub Actions inputs before
 * generating the thin caller. Handles:
 *   - deploy shorthand: docs/storybook → type + storybook-projects
 *   - preview: stripped (handled separately via extractPreviewConfig)
 *   - run-chromatic object → run-chromatic: true + chromatic-projects
 *   - plain arrays → JSON-stringified for YAML scalar quoting
 *
 * Used by both `holocron setup` and `sync-workflow-templates`.
 */
export function normalizeWorkflowWith(raw: Record<string, unknown>): Record<string, unknown> {
	const result = { ...raw };
	delete result["preview"];

	const hasDocs = raw["docs"] === true || (raw["docs"] !== null && typeof raw["docs"] === "object");
	const storybookProjects = raw["storybook"];
	if (hasDocs) {
		result["type"] = "docs";
		delete result["docs"];
	}
	if (Array.isArray(storybookProjects)) {
		if (!hasDocs) result["type"] = "storybook";
		result["storybook-projects"] = JSON.stringify(
			(storybookProjects as Array<{ name: string; path?: string }>).map(({ name, path = "." }) => ({
				name,
				workingDir: path,
			}))
		);
		delete result["storybook"];
	}

	const runChromatic = raw["run-chromatic"];
	if (runChromatic !== null && typeof runChromatic === "object" && "projects" in runChromatic) {
		result["run-chromatic"] = true;
		const projects = (runChromatic as { projects: Record<string, unknown>[] }).projects.map((p) => ({
			...p,
			...(Array.isArray(p.untraced) ? { untraced: (p.untraced as string[]).join("\n") } : {}),
		}));
		result["chromatic-projects"] = JSON.stringify(projects);
	}
	for (const [k, v] of Object.entries(result)) {
		if (Array.isArray(v)) result[k] = JSON.stringify(v);
	}
	return result;
}

/**
 * Derive on.push.paths entries from the deploy with: shorthand.
 * Used by both `holocron setup` and `sync-workflow-templates`.
 */
export function deriveDeployPaths(raw: Record<string, unknown>): string[] {
	const paths: string[] = [];
	const docs = raw["docs"];
	if (docs === true) {
		paths.push("docs/**");
		paths.push("astro.config.ts");
		paths.push("pnpm-workspace.yaml");
		paths.push("pnpm-lock.yaml");
	} else if (docs !== null && typeof docs === "object" && "path" in docs) {
		const p = (docs as { path: string }).path;
		if (p && p !== ".") paths.push(`${p}/**`);
	}
	const storybookProjects = raw["storybook"];
	if (Array.isArray(storybookProjects)) {
		for (const s of storybookProjects as Array<{ path?: string }>) {
			const p = s.path || ".";
			if (p === ".") {
				paths.push("src/**");
				paths.push(".storybook/**");
			} else {
				paths.push(`${p}/**`);
			}
		}
	}
	return paths;
}
