import { createInterface } from "node:readline";

/**
 * Print `message` and wait until Enter is pressed, the input ends, or Ctrl-C is pressed, whichever comes first, and
 * return which: `enter`, or `closed` for the other two. It never hangs on a closed input. It reads from stdin and
 * writes to stderr, so a pipe on stdout is never touched; the caller checks there is a terminal to answer it. The
 * streams are parameters so a test can answer for the user.
 */
export function waitForEnter(
	message: string,
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stderr
): Promise<"enter" | "closed"> {
	return new Promise((resolve) => {
		const rl = createInterface({ input, output });
		let answered = false;
		rl.on("close", () => resolve(answered ? "enter" : "closed"));
		// Ctrl-C in a terminal reaches the interface, not the process: closing it ends the wait.
		rl.on("SIGINT", () => rl.close());
		rl.question(message, () => {
			answered = true;
			rl.close();
		});
	});
}
