import type { ResolvedOptions } from "../../prompts/index.js";
import { isSecretOption } from "../is-secret-option/index.js";

/**
 * Secret option answers, keyed by the env var their handler reads instead
 * of argv (`ps` and shell history expose argv, never a child's own env) —
 * `<ENV_PREFIX>_<KEY_IN_SCREAMING_SNAKE_CASE>`, e.g. `otp` with prefix
 * `MYCLI` → `MYCLI_OTP`. Merged into the spawn's extra env alongside
 * `NO_UPDATE_NOTIFIER` and (for a preview spawn) the
 * {@link dryRunPreviewEnvVar}.
 */
export function secretEnv(resolved: ResolvedOptions, envPrefix: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const option of resolved.options) {
		if (!isSecretOption(option)) continue;
		const value = resolved.answers[option.key];
		if (typeof value !== "string" || value === "") continue;
		out[`${envPrefix}_${option.key.replace(/([A-Z])/g, "_$1").toUpperCase()}`] = value;
	}
	return out;
}
