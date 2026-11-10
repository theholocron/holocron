/** The last `lines` non-blank lines of a command's output, for a notice; ANSI colour codes are removed. */
export function tailOutput(output: string, lines = 6): string {
	// eslint-disable-next-line no-control-regex -- an ANSI escape starts with the ESC control character
	const clean = output.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
	return clean
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== "")
		.slice(-lines)
		.join("\n");
}
