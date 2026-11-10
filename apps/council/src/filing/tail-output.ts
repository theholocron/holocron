/** Lines an interactive shell prints when it has no terminal; they say nothing about the run. */
const SHELL_NOISE = /cannot set terminal process group|no job control in this shell/i;

/**
 * The last `lines` non-blank lines of a command's output, for a notice; ANSI colour codes and the shell noise lines
 * are removed first.
 */
export function tailOutput(output: string, lines = 6): string {
	// eslint-disable-next-line no-control-regex -- an ANSI escape starts with the ESC control character
	const clean = output.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
	return clean
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== "" && !SHELL_NOISE.test(line))
		.slice(-lines)
		.join("\n");
}
