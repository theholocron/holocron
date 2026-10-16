import type { Logger } from "@theholocron/observability/core";

// ── Public API ────────────────────────────────────────────────────────

export type VaultProvider = "doppler" | "1password" | "infisical" | "none";

export type DeploymentProvider = "vercel" | "none";

export type AgentChoice = "claude" | "none";

export type RuntimeEnvironment = "node" | "browser" | "universal" | "none";

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
	runtimeEnvironment?: RuntimeEnvironment;
	protection?: string;
	openSource?: boolean;
	usesExternalPackages?: boolean;
	topics?: string[];
	skills?: string[];
	/** Mark the new repo as a GitHub template repository. */
	isTemplate?: boolean;
	/** GitHub org that owns both the template and the new repo. Default: "theholocron". */
	org?: string;
	/** GitHub admin token forwarded to `holocron repo setup` during verify. */
	token?: string;
	dryRun?: boolean;
	noVerify?: boolean;
	/** Parent directory where the repo will be cloned. Default: process.cwd(). */
	cwd?: string;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable subprocess runner for testing. */
	exec?: (cmd: string, args: string[], opts: { cwd: string; stdio: "inherit"; env?: Record<string, string> }) => void;
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

// ── Config generation ─────────────────────────────────────────────────

export interface HolocronConfigOptions {
	name: string;
	type: string;
	org?: string;
	description?: string;
	homepage?: string;
	vaultProvider?: VaultProvider;
	vaultProject?: string;
	vaultConfig?: string;
	deploymentProvider?: DeploymentProvider;
	agent?: AgentChoice;
	runtimeEnvironment?: RuntimeEnvironment;
	protection?: string;
	openSource?: boolean;
	usesExternalPackages?: boolean;
	topics?: string[];
	skills?: string[];
}
