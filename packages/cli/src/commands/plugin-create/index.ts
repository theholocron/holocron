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
 *   4. Prompt — fill in any missing flags via cli-utils / inquirer
 *      (Phase B; Phase A takes fully-populated input).
 *   5. Generate — for each template, write to
 *      packages/holocron-plugin-<slug>/<path>.
 *   6. Verify (unless --no-verify) — Phase B; runs pnpm install +
 *      pnpm --filter <pkg> typecheck lint test.
 *   7. Print next steps.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CapabilityKey } from "../../capabilities/index.js";
import { CARDINALITY } from "../../capabilities/index.js";
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
import { render as renderVerifyToken } from "./templates/verify-token.js";
import { render as renderVerifyTokenTest } from "./templates/verify-token-test.js";
import { render as renderVitestConfig } from "./templates/vitest-config.js";

// ── Public API ──────────────────────────────────────────────────────

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

	const packageDir = path.join(cwd, "packages", `holocron-plugin-${input.slug}`);
	if (existsSync(packageDir)) {
		throw new PluginCreateError(
			`\`${packageDir}\` already exists — edit in place or pick a different slug.`
		);
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
		baseUrl: input.baseUrl,
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

function printNextSteps(print: (line: string) => void, inputs: TemplateInputs): void {
	print("");
	print(`  Scaffolded @theholocron/holocron-plugin-${inputs.slug} (17 files).`);
	print("");
	print("  Next:");
	print(`    1. pnpm install                                                        # picks up the workspace package`);
	print(`    2. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} typecheck   # green`);
	print(`    3. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} lint        # green`);
	print(`    4. pnpm --filter @theholocron/holocron-plugin-${inputs.slug} test        # green (stubs pass, real tests are it.todo)`);
	print(`    5. Implement ${inputs.capabilityClass} methods in src/capabilities/${inputs.capability}.ts`);
	print(`    6. Replace it.todo(...) with real tests in src/__tests__/${inputs.capability}.test.ts`);
	print("    7. Commit + push when capability is functionally complete.");
}
