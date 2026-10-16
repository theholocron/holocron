import type { Logger } from "@theholocron/observability/core";

import type { CapabilityKey } from "../../plugin/index.js";
import type { TemplateInputs } from "./template-inputs/index.js";

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
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable subprocess runner for testing. Defaults to execFileSync. */
	exec?: (cmd: string, args: string[], opts: { cwd: string; stdio: "inherit" }) => void;
}

export interface PluginCreateReport {
	status: "ok" | "fail";
	packagePath: string;
	filesWritten: string[];
	message?: string;
}

// ── Templates registry ──────────────────────────────────────────────

export interface TemplateEntry {
	/** Path relative to the plugin package root. */
	path: string;
	render: (inputs: TemplateInputs) => string;
}
