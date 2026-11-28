import type { PluginLoadFailure, PluginLoadReport } from "../create-plugin-system/index.js";
import { LoaderError } from "../loader-error/index.js";

/**
 * Whether a failure is the plugin package itself not being found. A plugin that is installed but one of whose own
 * dependencies is not (`Cannot find module 'tslib'`, a half-finished install) also fails to import, but running from
 * a global install would not fix it and "no plugin resolves here" would hide the real cause, so it is not one.
 */
function isUnresolvedPlugin({ error, packageName }: PluginLoadFailure): boolean {
	if (!(error instanceof LoaderError) || !error.message.startsWith("failed to import")) return false;
	const missing = /Cannot find (?:package|module) '([^']+)'/.exec(error.message)?.[1];
	return missing === undefined || missing === packageName || missing.startsWith(`${packageName}/`);
}

/**
 * Turn "every plugin failed because none is installed here" (a CLI run from a global install, outside the project that
 * has the plugins) into one actionable error, instead of a stack of `Cannot find package` failures.
 *
 * Does nothing in every other case: some capability loaded, a failure that is not a missing package (a bad token, an
 * unimplemented capability, a plugin whose own dependency is missing) or no plugins configured at all. Call it right after `await loader.load()`.
 *
 * @param loader - A loaded plugin loader.
 * @param command - The command being run, for the message.
 * @param createError - Builds the error to throw from the command and the unresolved package names.
 */
export function assertPluginsResolvable(
	loader: PluginLoadReport,
	command: string,
	createError: (command: string, packages: readonly string[]) => Error
): void {
	if (loader.loadedKeys().length > 0) return;
	const failures = loader.loadFailures();
	if (failures.length === 0) return;
	if (!failures.every(isUnresolvedPlugin)) return;
	throw createError(command, [...new Set(failures.map((f) => f.packageName))]);
}
