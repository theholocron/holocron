import type { LoadedConfig } from "../../../config/index.js";
import { PluginLoader, type RuntimeContext } from "../../../plugin/index.js";

export type SetupPrintLine = (line: string) => void;

export type SetupStatus = "ok" | "fail" | "skip" | "dry-run";

/** Why a step failed with HTTP 403. */
export type FailReason = "permissions" | "plan";

export interface SetupStepResult {
	capability: string;
	step: string;
	status: SetupStatus;
	message?: string;
	/** Set when status === "fail" and the error was a 403. */
	reason?: FailReason;
}

export interface SetupReport {
	steps: SetupStepResult[];
	summary: { ok: number; fail: number; skip: number; dryRun: number };
}

export interface RunSetupInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Lets tests inject a pre-loaded loader; defaults to native dynamic import. */
	loader?: PluginLoader;
	print?: SetupPrintLine;
	/** Injectable keyring backend. Tests pass `() => null` to skip real OS keychain lookups. */
	keyring?: (key: string) => string | null;
	/**
	 * `--hooks` / `--no-hooks` override for git-hook installation. `undefined`
	 * defers to `config.hooks`, then to `protection: "strict"`.
	 */
	hooks?: boolean;
}
