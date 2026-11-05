/**
 * The env var {@link launchMenu} sets on a dry-run preview child (`<ENV_PREFIX>_DRY_RUN_PREVIEW`), so its
 * handler knows this specific `--dry-run` came from the menu's own preview-then-ask flow, not a direct
 * `<bin> <cmd> --dry-run` invocation. A handler that supports it uses this — never bare `argv.dryRun` — to
 * decide whether to report {@link DRY_RUN_NOOP_EXIT_CODE}: that exit code only has special meaning to
 * `launchMenu` itself, so a direct/scripted `--dry-run` call must never produce it — doing so unconditionally
 * would silently change the public exit-code contract for a successful dry run.
 */
export function dryRunPreviewEnvVar(envPrefix: string): string {
	return `${envPrefix}_DRY_RUN_PREVIEW`;
}
