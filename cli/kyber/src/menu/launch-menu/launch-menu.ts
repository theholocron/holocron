import { confirm } from "@inquirer/prompts";

import { pickMenuItem, promptForOptions, promptForPositionals } from "../../prompts/index.js";
import { NonInteractiveError } from "../../ui/index.js";
import { buildChildArgv } from "../build-child-argv/index.js";
import { DRY_RUN_NOOP_EXIT_CODE } from "../dry-run-noop-exit-code/index.js";
import { dryRunPreviewEnvVar } from "../dry-run-preview-env-var/index.js";
import type { MenuEntry } from "../menu-entry/index.js";
import { BACK, GROUP, menuItems } from "../menu-items/index.js";
import { resolveForRealSpawn } from "../resolve-for-real-spawn/index.js";
import { secretEnv } from "../secret-env/index.js";
import { shouldPreviewDryRun } from "../should-preview-dry-run/index.js";
import { spawnChild } from "../spawn-child/index.js";
import type { LaunchMenuConfig } from "./launch-menu.type.js";

/**
 * Walk the nested menu over `entries` (starting at `config.startPath`, `[]` for the top), prompt for the picked
 * command's required positionals and options, spawn it as a fresh invocation of the running CLI, and set
 * `process.exitCode` from the child — the caller (a `$0` handler) returns normally afterward so the parent's own
 * telemetry flush / update-notifier tail still runs.
 *
 * Picking a group opens its submenu, which has a "← back" item; a command ends the walk. See {@link menuItems}
 * for how a level is built. Throws {@link NonInteractiveError} when stdin is not a TTY.
 *
 * For a command that honours `--dry-run` ({@link MenuEntry.supportsDryRun}) and wasn't opted out via
 * `--skip-dry-run` ({@link shouldPreviewDryRun}), this always previews first — a dry run doesn't mutate anything,
 * so there's nothing to ask permission for. A preview that exits non-zero stops here; one that reports
 * {@link DRY_RUN_NOOP_EXIT_CODE} (nothing would change) stops here too, skipping the follow-up question since the
 * real run would have nothing to do either. Otherwise it asks "proceed with the real run?" before the real spawn.
 *
 * Secret options are never put in argv: they reach the child as `<envPrefix>_<OPTION>` env vars (see
 * {@link secretEnv}), and a preview child additionally gets {@link dryRunPreviewEnvVar}.
 *
 * @param entries - The whole command surface, as data.
 * @param parentArgv - The parsed argv of the invocation that opened the menu; its global flags are forwarded.
 * @param config - Binds the menu to one CLI: its binary name, env prefix and optional messages.
 */
export async function launchMenu(
	entries: MenuEntry[],
	parentArgv: Record<string, unknown>,
	config: LaunchMenuConfig
): Promise<void> {
	const {
		bin,
		envPrefix,
		pickMessage,
		nonInteractiveMessage = `Run \`${bin} --help\` to see available commands.`,
		startPath = [],
	} = config;
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError(nonInteractiveMessage);
	}
	const stack: string[][] = [startPath];
	let picked: MenuEntry | undefined;
	while (!picked) {
		const path = stack[stack.length - 1]!;
		const items = menuItems(entries, path);
		if (stack.length > 1) {
			items.push({ name: "← back", value: BACK, description: "Return to the previous menu", haystack: "back" });
		}
		const message = stack.length === 1 ? pickMessage : `${path.join(" ")} — choose a subcommand:`;
		const value = await pickMenuItem(items, message);
		if (value === BACK) {
			stack.pop();
		} else if (value.startsWith(GROUP)) {
			stack.push(value.slice(GROUP.length).split(" "));
		} else {
			// `value` is drawn from `items`, which are built from `entries`, so this is always defined.
			picked = entries.find((e) => e.name === value);
		}
	}
	const positionals = await promptForPositionals(picked, {});
	const resolvedOptions = await promptForOptions(picked, {});
	const extraEnv = secretEnv(resolvedOptions, envPrefix);

	if (shouldPreviewDryRun(picked, parentArgv)) {
		const dryExit = await spawnChild(buildChildArgv(picked, positionals, resolvedOptions, parentArgv, true), {
			[dryRunPreviewEnvVar(envPrefix)]: "1",
			...extraEnv,
		});
		if (dryExit === DRY_RUN_NOOP_EXIT_CODE) {
			process.exitCode = 0;
			return;
		}
		if (dryExit !== 0) {
			process.exitCode = dryExit;
			return;
		}
		const proceed = await confirm({ message: "Dry run complete — proceed with the real run?", default: false });
		if (!proceed) {
			process.exitCode = 0;
			return;
		}
		const forReal = await resolveForRealSpawn(resolvedOptions);
		process.exitCode = await spawnChild(
			buildChildArgv(picked, positionals, forReal, parentArgv, false),
			secretEnv(forReal, envPrefix)
		);
		return;
	}

	const forReal = await resolveForRealSpawn(resolvedOptions);
	process.exitCode = await spawnChild(
		buildChildArgv(picked, positionals, forReal, parentArgv),
		secretEnv(forReal, envPrefix)
	);
}
