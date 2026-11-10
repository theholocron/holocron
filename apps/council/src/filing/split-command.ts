/** Splits a command setting into words on whitespace; single or double quotes keep a path with spaces in one word. */
export function splitCommand(command: string): string[] {
	const words: string[] = [];
	let current = "";
	let quote: string | undefined;
	let inWord = false;
	for (const char of command) {
		if (quote !== undefined) {
			if (char === quote) quote = undefined;
			else current += char;
		} else if (char === '"' || char === "'") {
			quote = char;
			inWord = true;
		} else if (/\s/.test(char)) {
			if (inWord) words.push(current);
			current = "";
			inWord = false;
		} else {
			current += char;
			inWord = true;
		}
	}
	if (inWord) words.push(current);
	return words;
}
