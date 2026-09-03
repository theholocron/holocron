/**
 * `holocron plugin create <slug> <vendor>` — scaffold a new plugin
 * package matching the proven template.
 *
 * Design: see `.notes/tool-plugin-create.spec.md`.
 *
 * Flow:
 *   1. Preflight — verify CWD is a workspace root (pnpm-workspace.yaml
 *      + packages/ dir present).
 *   2. Slug collision — packages/holocron-plugin-<slug>/ must not exist.
 *   3. Capability sanity — must be one of the 14 known keys; warn for
 *      many-cardinality caps.
 *   4. Generate — for each template, write to
 *      packages/holocron-plugin-<slug>/<path>.
 *   5. Verify (unless --no-verify) — runs pnpm install +
 *      pnpm --filter <pkg> typecheck lint test.
 *   6. Print next steps.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CapabilityKey } from "../../capabilities.js";
import { CARDINALITY } from "../../capabilities.js";
import { deriveDefaults, type TemplateInputs } from "./template-inputs.js";
import { render as renderAuth } from "./templates/auth.js";
import { render as renderAuthTest } from "./templates/auth-test.js";
import { render as renderCapability } from "./templates/capability.js";
import { render as renderCapabilityTest } from "./templates/capability-test.js";
import { render as renderEslintConfig } from "./templates/eslint-config.js";
import { render as renderHelpers } from "./templates/helpers.js";
import { render as renderIndexTest } from "./templates/index-test.js";
import { render as renderPackageJson } from "./templates/package-json.js";
import { render as renderPluginIndex } from "./templates/plugin-index.js";
import { render as renderReadme } from "./templates/readme.js";
import { render as renderRest } from "./templates/rest.js";
import { render as renderRestTest } from "./templates/rest-test.js";
import { render as renderTsconfigJson } from "./templates/tsconfig-json.js";
import { render as renderTsdownConfig } from "./templates/tsdown-config.js";
import { render as renderValidateScript } from "./templates/validate-script.js";
import { render as renderVerifyToken } from "./templates/verify-token.js";
import { render as renderVerifyTokenTest } from "./templates/verify-token-test.js";
import { render as renderVitestConfig } from "./templates/vitest-config.js";

// ── Public API ──────────────────────────────────────────────────────

// ── Wizard resolver ───────────────────────────────────────────────────

export interface PluginCreateWizardArgs {
	capability?: string;
	vendorEnv?: string;
	baseUrl?: string;
}

export interface PluginCreateWizardPrompts {
	selectCapability: () => Promise<string>;
	inputVendorEnv: () => Promise<string>;
	inputBaseUrl: () => Promise<string>;
}

/**
 * Resolve `capability`, `vendorEnv`, and `baseUrl` from argv or by calling
 * the supplied prompt functions for any that are absent. Extracted from
 * `cli.ts` so the resolution logic is unit-testable.
 */
export async function resolvePluginCreateInputs(
	args: PluginCreateWizardArgs,
	prompts: PluginCreateWizardPrompts
): Promise<{ capability: CapabilityKey; vendorEnv: string; baseUrl: string }> {
	const capability = (args.capability ?? (await prompts.selectCapability())) as CapabilityKey;
	const vendorEnv = args.vendorEnv ?? (await prompts.inputVendorEnv());
	const baseUrl = args.baseUrl ?? (await prompts.inputBaseUrl());
	return { capability, vendorEnv, baseUrl };
}

// ── Run input / report ────────────────────────────────────────────────

export interface RunPluginCreateInput {
	/** Package slug, e.g., "clerk". Kebab-case. */
	slug: string;
	/** Vendor display name, e.g., "Clerk". PascalCase. */
	vendorName: string;
	/** Capability the plugin implements — one of the 14 known keys. */
	capability: CapabilityKey;
	/** Vendor-native env var, e.g., "CLERK_SECRET_KEY". */
	vendorEnv: string;
	/** REST base URL, e.g., "https://api.clerk.com/v1". */
	baseUrl: string;
	/** Optional token env override. Defaults to `HOLOCRON_<VENDOR>_TOKEN`. */
	tokenEnv?: string;
	/** Print steps without writing files. */
	dryRun?: boolean;
	/** Skip the post-scaffold pnpm install/typecheck/lint/test. */
	noVerify?: boolean;
	/** Working directory (workspace root). Defaults to `process.cwd()`. */
	cwd?: string;
	/** Injection point for tests / dry-run wiring. Defaults to fs write. */
	writeFile?: (filepath: string, content: string) => void;
	/** Print fn — captures orchestrator output. Defaults to console.log. */
	print?: (line: string) => void;
	/** Injectable subprocess runner for testing. Defaults to execFileSync. */
	exec?: (cmd: string, args: string[], opts: { cwd: string; stdio: "inherit" }) => void;
}

export interface PluginCreateReport {
	status: "ok" | "fail";
	packagePath: string;
	filesWritten: string[];
	message?: string;
}

export class PluginCreateError extends Error {
	override name = "PluginCreateError";
}

// ── Templates registry ──────────────────────────────────────────────

interface TemplateEntry {
	/** Path relative to the plugin package root. */
	path: string;
	render: (inputs: TemplateInputs) => string;
}

const TEMPLATES: TemplateEntry[] = [
	// Config (5)
	{ path: "package.json", render: renderPackageJson },
	{ path: "tsconfig.json", render: renderTsconfigJson },
	{ path: "vitest.config.ts", render: renderVitestConfig },
	{ path: "eslint.config.js", render: renderEslintConfig },
	{ path: "tsdown.config.ts", render: renderTsdownConfig },
	// Docs (1)
	{ path: "README.md", render: renderReadme },
	// Source (5) — capability path uses the dynamic capability slug.
	{ path: "src/auth.ts", render: renderAuth },
	{ path: "src/rest.ts", render: renderRest },
	{ path: "src/verify-token.ts", render: renderVerifyToken },
	{ path: "src/index.ts", render: renderPluginIndex },
	{ path: "src/capabilities/{{capability}}.ts", render: renderCapability },
	// Tests (6)
	{ path: "src/__tests__/helpers.ts", render: renderHelpers },
	{ path: "src/__tests__/auth.test.ts", render: renderAuthTest },
	{ path: "src/__tests__/rest.test.ts", render: renderRestTest },
	{ path: "src/__tests__/verify-token.test.ts", render: renderVerifyTokenTest },
	{ path: "src/__tests__/{{capability}}.test.ts", render: renderCapabilityTest },
	{ path: "src/__tests__/index.test.ts", render: renderIndexTest },
	// Live-account validation script (1) — read-only smoke test.
	{ path: "scripts/validate.mjs", render: renderValidateScript },
];

/** Replace `{{capability}}` in a template path with the actual capability key. */
function resolvePath(template: string, inputs: TemplateInputs): string {
	return template.replace(/\{\{capability\}\}/g, inputs.capability);
}

// ── Orchestrator ────────────────────────────────────────────────────

export function runPluginCreate(input: RunPluginCreateInput): PluginCreateReport {
	const cwd = input.cwd ?? process.cwd();
	const print = input.print ?? ((line: string) => console.log(line));
	const write = input.writeFile ?? defaultWrite;

	preflight(cwd);
	validateSlug(input.slug);
	validateVendorName(input.vendorName);

	const packageDir = path.join(cwd, "packages", `holocron-plugin-${input.slug}`);
	if (existsSync(packageDir)) {
		throw new PluginCreateError(`\`${packageDir}\` already exists — edit in place or pick a different slug.`);
	}

	validateCapability(input.capability, print);

	const derived = deriveDefaults({
		slug: input.slug,
		vendorName: input.vendorName,
		capability: input.capability,
	});
	const inputs: TemplateInputs = {
		slug: input.slug,
		vendorName: input.vendorName,
		vendorUpper: derived.vendorUpper,
		capability: input.capability,
		capabilityClass: derived.capabilityClass,
		tokenEnv: input.tokenEnv ?? derived.tokenEnv,
		vendorEnv: input.vendorEnv,
		// Normalize: strip trailing slashes so the embedded value in the
		// generated rest-test.ts matches what the client trims at runtime.
		baseUrl: trimTrailingSlashes(input.baseUrl),
		transport: derived.transport,
	};

	const filesWritten: string[] = [];
	print(`Scaffolding @theholocron/holocron-plugin-${inputs.slug}${input.dryRun ? " (dry-run)" : ""}`);
	print(`  → ${packageDir}`);
	for (const template of TEMPLATES) {
		const resolvedPath = resolvePath(template.path, inputs);
		const filepath = path.join(packageDir, resolvedPath);
		const content = template.render(inputs);
		if (input.dryRun) {
			print(`  … would write ${resolvedPath} (${content.length} bytes)`);
		} else {
			write(filepath, content);
			print(`  ✓ ${resolvedPath}`);
		}
		filesWritten.push(resolvedPath);
	}

	if (!input.dryRun && !input.noVerify) {
		const execFn = input.exec ?? defaultExec;
		const pkg = `@theholocron/holocron-plugin-${inputs.slug}`;
		print("");
		print("  Verifying scaffold…");
		try {
			execFn("pnpm", ["install", "--frozen-lockfile=false"], { cwd, stdio: "inherit" });
			execFn("pnpm", ["--filter", pkg, "typecheck"], { cwd, stdio: "inherit" });
			execFn("pnpm", ["--filter", pkg, "lint"], { cwd, stdio: "inherit" });
			execFn("pnpm", ["--filter", pkg, "test"], { cwd, stdio: "inherit" });
			print("  ✓ scaffold verified");
		} catch (err) {
			print(`  ✗ verify failed — ${err instanceof Error ? err.message : String(err)}`);
			return {
				status: "fail",
				packagePath: packageDir,
				filesWritten,
				message: "post-scaffold verify failed; inspect output above",
			};
		}
	}

	if (!input.dryRun) {
		printNextSteps(print, inputs);
	}

	return { status: "ok", packagePath: packageDir, filesWritten };
}

// ── Internals ───────────────────────────────────────────────────────

function preflight(cwd: string): void {
	if (!existsSync(path.join(cwd, "pnpm-workspace.yaml"))) {
		throw new PluginCreateError(
			`\`pnpm-workspace.yaml\` not found in \`${cwd}\`. Run \`holocron plugin create\` from the monorepo root.`
		);
	}
	if (!existsSync(path.join(cwd, "packages"))) {
		throw new PluginCreateError(`\`packages/\` directory not found in \`${cwd}\`.`);
	}
}

/**
 * npm-package-name conventions: kebab-case, starts with lowercase
 * letter. Rejecting numeric-prefixed slugs also sidesteps the
 * `env.HOLOCRON_1FOO_TOKEN` invalid-identifier trap in the auth
 * template.
 */
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

function validateSlug(slug: string): void {
	if (!SLUG_RE.test(slug)) {
		throw new PluginCreateError(
			`invalid slug "${slug}" — must be kebab-case: lowercase letter followed by lowercase letters, digits, or hyphens. ` +
				`Examples: "clerk", "cloud-flare", "doppler".`
		);
	}
}

/** PascalCase — starts with uppercase, alphanumeric only. */
const VENDOR_NAME_RE = /^[A-Z][a-zA-Z0-9]*$/;

function validateVendorName(name: string): void {
	if (!VENDOR_NAME_RE.test(name)) {
		throw new PluginCreateError(
			`invalid vendor name "${name}" — must be PascalCase: starts with uppercase, alphanumeric only. ` +
				`Examples: "Clerk", "CloudFlare", "Doppler".`
		);
	}
}

/**
 * Trim trailing slashes with a plain loop (no regex — matches the
 * rest.ts template's own trimming to stay ReDoS-safe under CodeQL).
 */
function trimTrailingSlashes(url: string): string {
	let out = url;
	while (out.endsWith("/")) out = out.slice(0, -1);
	return out;
}

function validateCapability(capability: CapabilityKey, print: (line: string) => void): void {
	if (!(capability in CARDINALITY)) {
		throw new PluginCreateError(
			`\`${capability}\` is not a known capability. See \`packages/cli/src/capabilities/index.ts\`.`
		);
	}
	if (CARDINALITY[capability] === "many") {
		print(
			`  ! ${capability} is a many-cardinality capability — multiple providers can be active at once. ` +
				"Confirm your config wiring accordingly."
		);
	}
}

function defaultWrite(filepath: string, content: string): void {
	mkdirSync(path.dirname(filepath), { recursive: true });
	writeFileSync(filepath, content, "utf8");
}

function defaultExec(cmd: string, args: string[], opts: { cwd: string; stdio: "inherit" }): void {
	execFileSync(cmd, args, { cwd: opts.cwd, stdio: opts.stdio });
}

function printNextSteps(print: (line: string) => void, inputs: TemplateInputs): void {
	print("");
	print(`  Scaffolded @theholocron/holocron-plugin-${inputs.slug} (18 files).`);
	print("");
	print("  Next:");
	print(
		`    1. pnpm install                                                        # picks up the workspace package`
	);
	print(`    2. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} typecheck   # green`);
	print(`    3. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} lint        # green`);
	print(
		`    4. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} test        # green (stubs pass, real tests are it.todo)`
	);
	print(`    5. Implement ${inputs.capabilityClass} methods in src/capabilities/${inputs.capability}.ts`);
	print(`    6. Replace it.todo(...) with real tests in src/__tests__/${inputs.capability}.test.ts`);
	print("    7. Commit + push when capability is functionally complete.");
}
