import { onRetry } from "@theholocron/http-client";
import ora, { type Ora } from "ora";

/**
 * Runs `fn`, showing an ora spinner for its duration in TTY environments.
 * In non-TTY environments (CI, pipes, tests) the spinner is skipped entirely.
 */
export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
	if (!process.stdout.isTTY) {
		return fn();
	}
	const spinner = ora(label).start();
	try {
		const result = await fn();
		spinner.succeed();
		return result;
	} catch (err) {
		spinner.fail();
		throw err;
	}
}

let allowed = true;

/** Turn progress off for the run (`--quiet`, `--log`), so nothing extra shares the terminal with what those print. */
export function allowProgress(on: boolean): void {
	allowed = on;
}

/**
 * Whether to draw a progress line: only when a person is watching a terminal (stdout and stderr both), not in CI, and not
 * switched off. Everywhere else the output stays the plain line-per-step text that scripts and the docs rely on.
 */
export function progressEnabled(): boolean {
	return allowed && Boolean(process.stdout.isTTY) && Boolean(process.stderr.isTTY) && !process.env["CI"];
}

export interface Progress {
	/** Run `fn` under a spinner named `label`. The spinner is cleared, not kept, so the step's own result line stands alone. */
	run<T>(label: string, fn: () => Promise<T>): Promise<T>;
	/** Print a line without breaking the spinner: it is cleared, the line printed, and the spinner drawn again. */
	print(line: string): void;
}

/**
 * A spinner for one step at a time that a step can print through. Steps that only return a result use {@link
 * withProgress}; a step that prints its own result line while it runs (`notifications setup`) prints through `print`.
 */
export function createProgress(print: (line: string) => void, enabled: () => boolean = progressEnabled): Progress {
	let active: Ora | undefined;
	return {
		async run(label, fn) {
			if (!enabled()) return fn();
			const spinner = ora({ text: label, stream: process.stderr, discardStdin: false }).start();
			active = spinner;
			// A request that is being sent again says so, so a slow step is not mistaken for a stuck one.
			const stopListening = onRetry((e) => {
				spinner.text = `${label} (retrying ${e.vendor ?? "the request"}, attempt ${e.attempt} of ${e.of})`;
			});
			try {
				return await fn();
			} finally {
				stopListening();
				spinner.stop();
				active = undefined;
			}
		},
		print(line) {
			const spinner = active;
			if (!spinner) return print(line);
			spinner.stop();
			print(line);
			spinner.start();
		},
	};
}

/** `fn` under a cleared-when-done spinner named `label`, on a terminal only. */
export function withProgress<T>(label: string, fn: () => Promise<T>): Promise<T> {
	return createProgress(() => {}).run(label, fn);
}
