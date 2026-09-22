/**
 * This App's brand name — the "Sentinel /" prefix any action posts as
 * part of a check run, report, or comment. One source, so a second
 * action never hardcodes its own copy (or a typo of it).
 */
export const SENTINEL_APP_NAME = "Sentinel";

/**
 * Humanized display form of each `astromech` task namespace prefix Sentinel
 * carries through a check-run name (D5, `tech-sentinel-enforcement.spec.md`:
 * `Sentinel / <namespace, humanized> / <the existing CI check's own name>`).
 * Keyed by the same prefix the task itself uses (`platform.commitStandards`
 * → `platform`), so a future check adds one entry here instead of a second
 * hand-typed copy of the string. Only `platform` exists today — the next
 * namespace (`sourceQuality`, for eslint/prettier once those checks move to
 * Sentinel too) gets added here when it's actually built, not guessed at
 * now.
 */
export const SENTINEL_NAMESPACES = {
	platform: "Platform",
} as const satisfies Record<string, string>;
