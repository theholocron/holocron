/**
 * Reserved exit code a dry-run-capable handler may use — only when the
 * {@link dryRunPreviewEnvVar} is set — to report "ran clean, nothing would
 * change." {@link launchMenu} treats it as success but skips the "proceed with
 * the real run?" question, since there's nothing for the real run to do
 * either.
 */
export const DRY_RUN_NOOP_EXIT_CODE = 2;
