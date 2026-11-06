import { createMenu, DRY_RUN_NOOP_EXIT_CODE } from "@theholocron/kyber/menu";

export { DRY_RUN_NOOP_EXIT_CODE };

/**
 * Kyber's menu engine bound to `holocron`: secret options travel as `HOLOCRON_<OPTION>` env vars and the
 * non-interactive hint names the `holocron` bin. Feed it {@link COMMAND_REGISTRY} (plus any dynamically-built
 * entries); see `docs/wiki/specifications/tool-interactive-cli-menu.spec.md`.
 *
 * Set on a dry-run preview child's env, `dryRunPreviewEnvVar` tells its handler this `--dry-run` came from the menu's own
 * preview-then-ask flow, not a direct `holocron <cmd> --dry-run`; a handler that supports it uses that to decide
 * whether to report {@link DRY_RUN_NOOP_EXIT_CODE}.
 */
const menu = createMenu({ bin: "holocron", envPrefix: "HOLOCRON" });

export const launchMenu = menu.launchMenu;

/** The env var a Holocron dry-run preview child gets (`HOLOCRON_DRY_RUN_PREVIEW`). */
export const DRY_RUN_PREVIEW_ENV_VAR = menu.dryRunPreviewEnvVar;
