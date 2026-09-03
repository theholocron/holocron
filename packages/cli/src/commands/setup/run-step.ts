import type { LoadedConfig } from "../../config/load-config.js";
import type { RuntimeContext } from "../../plugin/loader.js";
import { PluginLoader } from "../../plugin/loader.js";
import { ProviderApiError } from "../../plugin/capabilities.js";

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
}

export async function runStep(
	capability: string,
	step: string,
	dryRun: boolean,
	body: () => Promise<string | void>,
	opts: { skipCodes?: number[] } = {}
): Promise<SetupStepResult> {
	if (dryRun) {
		return { capability, step, status: "dry-run" };
	}
	try {
		const note = await body();
		const result: SetupStepResult = { capability, step, status: "ok" };
		if (typeof note === "string") result.message = note;
		return result;
	} catch (err) {
		if (err instanceof ProviderApiError) {
			if (err.status !== undefined && opts.skipCodes?.includes(err.status)) {
				return { capability, step, status: "skip", message: err.message };
			}
			if (err.status === 403) {
				const reason = classify403(err);
				// Plan-restriction 403s mean the feature is unavailable on the current
				// plan — not a setup failure, just a capability gap. Report as skip.
				return { capability, step, status: reason === "plan" ? "skip" : "fail", message: err.message, reason };
			}
		}
		return {
			capability,
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

export function classify403(err: ProviderApiError): FailReason {
	const detailText =
		typeof err.details === "string"
			? err.details
			: typeof err.details === "object" && err.details !== null && "message" in err.details
				? String((err.details as { message?: unknown }).message)
				: "";
	const text = `${err.message} ${detailText}`.toLowerCase();
	if (
		text.includes("advanced security") ||
		text.includes("not enabled for this repository") ||
		text.includes("upgrade") ||
		text.includes("not available on")
	) {
		return "plan";
	}
	return "permissions";
}

import { style } from "../../ui/style.js";

export function formatStep(step: SetupStepResult): string {
	const tag = step.reason === "permissions" ? " [permissions]" : step.reason === "plan" ? " [plan restriction]" : "";
	const detail = step.message ? style.dim(`  (${step.message})`) : "";
	const label = `${step.step}${tag}${detail}`;
	if (step.status === "ok") return `    ${style.success(label)}`;
	if (step.status === "fail") return `    ${style.fail(label)}`;
	if (step.status === "dry-run") return `    ${style.dim(`… ${label}`)}`;
	return `    ${style.dim(`· ${label}`)}`;
}
