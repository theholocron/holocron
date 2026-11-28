import type { EnvLookup } from "@theholocron/env-utils/lookup";

/**
 * `argvOtp` if given, else the `HOLOCRON_OTP` env var — the secret-delivery
 * side of the interactive menu's options prompt (holocron#1052): a
 * menu-launched `publish package` delivers `--otp` through this env var
 * instead of argv, since `ps` and shell history both expose a child's argv
 * but never its env. A direct `holocron publish package --otp <code>`
 * invocation is unaffected; the flag always wins when both are present.
 */
export function resolveOtp(argvOtp: string | undefined, env: EnvLookup): string | undefined {
	return argvOtp ?? env.get("HOLOCRON_OTP");
}
