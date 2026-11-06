import type { PluginLoadReport } from "../create-plugin-system/index.js";
import { LoaderError } from "../loader-error/index.js";

/**
 * Turn "every plugin failed because none is installed here" (a CLI run from a global install, outside the project that
 * has the plugins) into one actionable error, instead of a stack of `Cannot find package` failures.
 *
 * Does nothing in every other case: some capability loaded, a failure that is not a missing package (a bad token, an
 * unimplemented capability) or no plugins configured at all. Call it right after `await loader.load()`.
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
	const isImportFailure = (err: Error): boolean =>
		err instanceof LoaderError && err.message.startsWith("failed to import");
	if (!failures.every((f) => isImportFailure(f.error))) return;
	throw createError(command, [...new Set(failures.map((f) => f.packageName))]);
}
