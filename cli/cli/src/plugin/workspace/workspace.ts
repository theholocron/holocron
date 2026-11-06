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
 * is left alone for the command's own soft-skip reporting. The check
 * itself is kyber's; the message here is Holocron's.
 *
 * Spec: `docs/wiki/specifications/tech-cli-execution-contexts.spec.md`
 * (theholocron/holocron#576).
 */

import { assertPluginsResolvable as assertResolvable, isModuleNotFound } from "@theholocron/kyber/plugins";

import type { PluginLoader } from "../loader/index.js";

export { isModuleNotFound };

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
				`https://docs.theholocron.dev/holocron/execution-contexts`
		);
		this.command = command;
		this.packages = packages;
	}
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
	assertResolvable(loader, command, (cmd, packages) => new WorkspaceContextError(cmd, packages));
}
