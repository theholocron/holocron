import { createInterface } from "node:readline";

/**
 * Print `message` and wait for Enter. It reads from stdin and writes to stderr, so a pipe on stdout is never touched;
 * the caller checks there is a terminal to answer it. The streams are parameters so a test can answer for the user.
 */
export function waitForEnter(
	message: string,
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stderr
): Promise<void> {
	return new Promise((resolve) => {
		const rl = createInterface({ input, output });
		rl.question(message, () => {
			rl.close();
			resolve();
		});
	});
}
