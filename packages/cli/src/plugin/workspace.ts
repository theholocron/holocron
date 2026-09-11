/**
 * The `workspace`-context guard.
 *
 * A `workspace` command (`sync`, `setup`, `doctor`, …) needs the
 * configured providers' `@theholocron/holocron-plugin-*` packages to
 * resolve. From a bare `npm i -g @theholocron/cli` they don't, and the
 * {@link PluginLoader} — which soft-skips every failure — leaves the
 * command with an empty registry and a stack of `Cannot find package`
 * errors.
 *
 * {@link assertPluginsResolvable} turns that specific situation (every
 * provider failed, and every failure is a module-resolution failure)
 * into one actionable {@link WorkspaceContextError} the CLI prints
 * instead of a stack trace. Any other mix — some plugins loaded, or a
 * failure that's an auth/token error rather than a missing package —
 * is left alone for the command's own soft-skip reporting.
 *
 * Spec: `docs/wiki/specifications/tech-cli-execution-contexts.spec.md`
 * (theholocron/holocron#576).
 */

import { LoaderError, type PluginLoader } from "./loader.js";

/**
 * Raised when a `workspace` command runs somewhere its provider plugins
 * cannot be resolved — the "you're on a global install" case. Carries the
 * unresolved package names so the message can be specific.
 */
export class WorkspaceContextError extends Error {
	override name = "WorkspaceContextError";
	readonly command: string;
	readonly packages: readonly string[];

	constructor(command: string, packages: readonly string[]) {
		const [first, ...rest] = packages;
		const subject =
			rest.length > 0
				? `${first} (and ${rest.length} other${rest.length === 1 ? "" : "s"})`
				: (first ?? "its plugins");
		super(
			`\`${command}\` needs ${subject}, but no plugin package resolves here.\n` +
				`Run it from a repo that has the \`@theholocron/holocron-plugin-*\` packages as devDependencies, ` +
				`or \`pnpm exec holocron ${command}\`. A global install can't resolve them — see ` +
				`https://theholocron.github.io/holocron/execution-contexts`
		);
		this.command = command;
		this.packages = packages;
	}
}

/**
 * A raw "package isn't installed here" error from `import()` /
 * `require.resolve` — `ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND`, or the
 * "Cannot find package/module" message Node prints for it.
 */
export function isModuleNotFound(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
	return /Cannot find (?:package|module)|MODULE_NOT_FOUND/.test(err.message);
}

/** Did this failure come from the dynamic `import()` not finding the package? */
function isImportFailure(err: Error): boolean {
	return err instanceof LoaderError && err.message.startsWith("failed to import");
}

/**
 * Throw {@link WorkspaceContextError} when a loaded `PluginLoader` shows
 * the global-install signature: nothing in the registry, at least one
 * failure, and *every* failure is a missing-package error. A no-op in
 * every other case (some capability loaded, non-import failure, or no
 * providers configured at all).
 *
 * Call it right after `await loader.load()` in a `workspace` command.
 */
export function assertPluginsResolvable(loader: PluginLoader, command: string): void {
	if (loader.loadedKeys().length > 0) return;
	const failures = loader.loadFailures();
	if (failures.length === 0) return;
	if (!failures.every((f) => isImportFailure(f.error))) return;

	const packages = [...new Set(failures.map((f) => f.packageName))];
	throw new WorkspaceContextError(command, packages);
}
