/**
 * Control characters (newlines and the C1 range included, whose 0x9b is an 8-bit CSI) turned into spaces and whitespace
 * collapsed, with no length cap. For text from outside the process that is about to reach a terminal, where a crafted
 * value could otherwise forge extra lines or inject escape sequences.
 */
export function stripControl(text: string): string {
	return (
		text
			// eslint-disable-next-line no-control-regex -- deliberately matching control chars (incl. newlines) to strip them
			.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}
