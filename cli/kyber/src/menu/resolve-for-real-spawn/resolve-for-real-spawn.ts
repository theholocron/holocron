import { promptForDeferredOptions, type ResolvedOptions } from "../../prompts/index.js";

/**
 * Collects `resolved.deferred`'s values and folds them into
 * `resolved.answers` — call this once, right before building the real
 * (non-dry-run) spawn's argv, never any earlier: a dry-run preview and
 * a human confirming "proceed with the real run?" can both take a while,
 * and a time-sensitive secret (an OTP) typed before either risks going
 * stale before it's actually used. A no-op when nothing was deferred.
 */
export async function resolveForRealSpawn(resolved: ResolvedOptions): Promise<ResolvedOptions> {
	if (!resolved.deferred || resolved.deferred.length === 0) return resolved;
	const deferredAnswers = await promptForDeferredOptions(resolved.deferred);
	return { ...resolved, answers: { ...resolved.answers, ...deferredAnswers } };
}
