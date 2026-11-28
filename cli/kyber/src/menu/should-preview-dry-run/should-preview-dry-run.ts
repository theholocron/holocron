import type { MenuEntry } from "../menu-entry/index.js";

/**
 * Whether {@link launchMenu} should auto-preview a picked command before running
 * it for real — only when the command's handler actually honours
 * `--dry-run` ({@link MenuEntry.supportsDryRun}) and the top-level
 * invocation didn't pass `--skip-dry-run` to opt out of the preview
 * entirely (an escape hatch for "I already know what I want, skip
 * straight to the real run").
 */
export function shouldPreviewDryRun(entry: MenuEntry, parentArgv: Record<string, unknown>): boolean {
	return Boolean(entry.supportsDryRun) && parentArgv.skipDryRun !== true;
}
