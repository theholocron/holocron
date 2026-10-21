import { spawn } from "node:child_process";

import { confirm } from "@inquirer/prompts";

import {
	NonInteractiveError,
	pickMenuItem,
	promptForDeferredOptions,
	promptForOptions,
	promptForPositionals,
	type ResolvedOptions,
} from "../../ui/index.js";
import { buildChildArgv, secretEnv } from "../child-argv/index.js";
import type { CommandEntry } from "../command-registry/index.js";
import { BACK, GROUP, menuItems } from "../menu-items/index.js";

/**
 * Set on a dry-run preview child's env ({@link spawnChild}'s `extraEnv`) so
 * its handler knows this specific `--dry-run` came from `launchMenu`'s own
 * preview-then-ask flow, not a direct `holocron <cmd> --dry-run` invocation.
 * A handler that supports it uses this — never bare `argv.dryRun` — to
 * decide whether to report {@link DRY_RUN_NOOP_EXIT_CODE}: that exit code
 * only has special meaning to `launchMenu` itself, so a direct/scripted
 * `--dry-run` call must never produce it — doing so unconditionally would
 * silently change the public exit-code contract for a successful dry run.
 */
export const DRY_RUN_PREVIEW_ENV_VAR = "HOLOCRON_DRY_RUN_PREVIEW";

/**
 * Reserved exit code a dry-run-capable handler may use — only when {@link
 * DRY_RUN_PREVIEW_ENV_VAR} is set — to report "ran clean, nothing would
 * change." `launchMenu` treats it as success but skips the "proceed with
 * the real run?" question, since there's nothing for the real run to do
 * either.
 */
export const DRY_RUN_NOOP_EXIT_CODE = 2;

/**
 * Spawn `holocron <...args>` inheriting stdio; resolve with its exit code.
 *
 * `NO_UPDATE_NOTIFIER` is forced on in the child's env — the parent's own
 * update-notifier tail still runs after this resolves (see `launchMenu`'s
 * docstring), so without this the freshly-spawned child independently runs
 * its own `checkForUpdates()` too and the notice prints twice: once from
 * the child right after its command output, once more from the parent
 * once the child exits. `extraEnv` layers on top — used only for {@link
 * DRY_RUN_PREVIEW_ENV_VAR} on the dry-run preview spawn.
 */
function spawnChild(args: string[], extraEnv?: Record<string, string>): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [process.argv[1]!, ...args], {
			stdio: "inherit",
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...extraEnv },
		});
		child.on("exit", (code) => resolve(code ?? 0));
		child.on("error", () => resolve(1));
	});
}

/**
 * Collects `resolved.deferred`'s values (holocron#1052 follow-up) and folds
 * them into `resolved.answers` — call this once, right before building the
 * real (non-dry-run) spawn's argv, never any earlier: a dry-run preview and
 * a human confirming "proceed with the real run?" can both take a while,
 * and a time-sensitive secret (an OTP) typed before either risks going
 * stale before it's actually used. A no-op when nothing was deferred.
 */
async function resolveForRealSpawn(resolved: ResolvedOptions): Promise<ResolvedOptions> {
	if (!resolved.deferred || resolved.deferred.length === 0) return resolved;
	const deferredAnswers = await promptForDeferredOptions(resolved.deferred);
	return { ...resolved, answers: { ...resolved.answers, ...deferredAnswers } };
}

/**
 * Whether `launchMenu` should auto-preview a picked command before running
 * it for real — only when the command's handler actually honours
 * `--dry-run` ({@link CommandEntry.supportsDryRun}) and the top-level
 * invocation didn't pass `--skip-dry-run` to opt out of the preview
 * entirely (an escape hatch for "I already know what I want, skip
 * straight to the real run").
 */
export function shouldPreviewDryRun(entry: CommandEntry, parentArgv: Record<string, unknown>): boolean {
	return Boolean(entry.supportsDryRun) && parentArgv.skipDryRun !== true;
}

/**
 * Layers 1 and 2: walk the nested menu over `entries` (starting at `startPath`,
 * `[]` for the top), prompt for the picked command's required positionals, spawn
 * it as a fresh `holocron` invocation, and set `process.exitCode` from the child —
 * the caller (a `$0` handler in `cli.ts`) returns normally afterward so the
 * parent's own telemetry flush / update-notifier tail still runs. The parent's
 * own `command_completed` event fires with command name "unknown" (the middleware
 * ran before any command was picked) — left as-is rather than suppressed; it's a
 * real, useful signal ("the menu got used").
 *
 * Picking a group opens its submenu, which has a "← back" item; a command ends
 * the walk. See {@link menuItems} for how a level is built.
 *
 * For a command that honours `--dry-run` ({@link CommandEntry.supportsDryRun})
 * and wasn't opted out via `--skip-dry-run` ({@link shouldPreviewDryRun}),
 * this always previews first — a dry run doesn't mutate anything, so
 * there's nothing to ask permission for. A preview that exits non-zero
 * stops here; one that reports {@link DRY_RUN_NOOP_EXIT_CODE} (nothing
 * would change) stops here too, skipping the follow-up question since the
 * real run would have nothing to do either. Otherwise it asks "proceed
 * with the real run?" before the real spawn — the one actual decision
 * left to make, since this one does mutate something.
 */
export async function launchMenu(
	entries: CommandEntry[],
	parentArgv: Record<string, unknown>,
	pickMessage?: string,
	nonInteractiveMessage = "Run `holocron --help` to see available commands.",
	startPath: string[] = []
): Promise<void> {
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError(nonInteractiveMessage);
	}
	const stack: string[][] = [startPath];
	let picked: CommandEntry | undefined;
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
	const extraEnv = secretEnv(resolvedOptions);

	if (shouldPreviewDryRun(picked, parentArgv)) {
		const dryExit = await spawnChild(buildChildArgv(picked, positionals, resolvedOptions, parentArgv, true), {
			[DRY_RUN_PREVIEW_ENV_VAR]: "1",
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
			secretEnv(forReal)
		);
		return;
	}

	const forReal = await resolveForRealSpawn(resolvedOptions);
	process.exitCode = await spawnChild(buildChildArgv(picked, positionals, forReal, parentArgv), secretEnv(forReal));
}
