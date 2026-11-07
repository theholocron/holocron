import { spawn } from "node:child_process";

/**
 * Spawn the running CLI again with `args`, inheriting stdio; resolve with its exit code.
 *
 * `NO_UPDATE_NOTIFIER` is forced on in the child's env — the parent's own
 * update-notifier tail still runs after this resolves (see {@link launchMenu}),
 * so without this the freshly-spawned child independently runs its own
 * update check too and the notice prints twice: once from the child right
 * after its command output, once more from the parent once the child exits.
 * `extraEnv` layers on top — used for the {@link dryRunPreviewEnvVar} on the
 * dry-run preview spawn and for secret option answers.
 */
export function spawnChild(args: string[], extraEnv?: Record<string, string>): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [process.argv[1]!, ...args], {
			stdio: "inherit",
			// The child gets the whole environment (a pass-through, not a read of one variable).
			// eslint-disable-next-line no-restricted-properties
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...extraEnv },
		});
		child.on("exit", (code) => resolve(code ?? 0));
		child.on("error", () => resolve(1));
	});
}
