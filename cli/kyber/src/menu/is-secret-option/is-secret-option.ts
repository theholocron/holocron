import type { OptionPrompt } from "../../prompts/index.js";

/**
 * Whether `option`'s answer must be delivered via env, never argv — true for
 * an explicit `secret: true`, and also for any `type: "password"` option
 * even if `secret` was left unset. `promptForOptions` already treats these
 * two as interchangeable triggers for masking the input itself;
 * {@link buildChildArgv}/{@link secretEnv} need to agree, or a password-typed
 * option that forgot to also set `secret: true` would mask the keystrokes
 * on screen while still leaking the typed value into the child's argv.
 */
export function isSecretOption(option: OptionPrompt): boolean {
	return Boolean(option.secret) || option.type === "password";
}
