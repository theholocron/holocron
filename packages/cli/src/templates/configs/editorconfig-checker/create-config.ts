import editorconfigChecker from "./editorconfig-checker.json";

/**
 * The generated `.editorconfig-checker.json`.
 *
 * Deliberately carries no `"Version"` key: editorconfig-checker treats it as a
 * hard gate and exits non-zero the moment the running binary's version differs
 * — which it does the instant a contributor's local install (Homebrew tracks
 * latest) drifts from the version super-linter bundles in CI, breaking
 * `holocron run lint` / the pre-push hook for everyone (#618). The config
 * options here (`Exclude`, `Disable`) are stable across releases, so pinning
 * buys nothing.
 */
export function createConfig(): string {
	return JSON.stringify(editorconfigChecker, null, 2) + "\n";
}
