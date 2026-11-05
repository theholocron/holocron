import { DRY_RUN_NOOP_EXIT_CODE, dryRunPreviewEnvVar, launchMenu as launchKyberMenu } from "@theholocron/kyber/menu";

import type { CommandEntry } from "../command-registry/index.js";

export { DRY_RUN_NOOP_EXIT_CODE };

/**
 * Set on a dry-run preview child's env so its handler knows this specific `--dry-run` came from the menu's
 * own preview-then-ask flow, not a direct `holocron <cmd> --dry-run` invocation (see kyber's
 * `dryRunPreviewEnvVar`). A handler that supports it uses this to decide whether to report
 * {@link DRY_RUN_NOOP_EXIT_CODE}.
 */
export const DRY_RUN_PREVIEW_ENV_VAR = dryRunPreviewEnvVar("HOLOCRON");

/**
 * Kyber's menu engine bound to `holocron`: secret options travel as `HOLOCRON_<OPTION>` env vars and the
 * non-interactive hint names the `holocron` bin. See the spec in `docs/wiki/specifications/tool-interactive-cli-menu.spec.md`.
 *
 * @param entries - The commands to offer (usually {@link COMMAND_REGISTRY}, plus any dynamically-built ones).
 * @param parentArgv - The invocation that opened the menu; its global flags are forwarded to the child.
 * @param pickMessage - The question at the first level.
 * @param nonInteractiveMessage - The error thrown without a TTY; defaults to a hint to run `holocron --help`.
 * @param startPath - The group to open first, as words (`["repo"]`).
 */
export function launchMenu(
	entries: CommandEntry[],
	parentArgv: Record<string, unknown>,
	pickMessage?: string,
	nonInteractiveMessage?: string,
	startPath?: string[]
): Promise<void> {
	return launchKyberMenu(entries, parentArgv, {
		bin: "holocron",
		envPrefix: "HOLOCRON",
		...(pickMessage !== undefined && { pickMessage }),
		...(nonInteractiveMessage !== undefined && { nonInteractiveMessage }),
		...(startPath !== undefined && { startPath }),
	});
}
