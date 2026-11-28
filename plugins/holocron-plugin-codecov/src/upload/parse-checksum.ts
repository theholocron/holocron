/**
 * The digest `sha256sum` printed for `name` in a checksum file (`<hex>  <name>`, or `<hex> *<name>` for a binary
 * file), or `undefined` when the file has no line for it.
 */
export function parseChecksum(text: string, name: string): string | undefined {
	for (const line of text.split("\n")) {
		const match = /^([0-9a-fA-F]{64}) [ *](.+?)\r?$/.exec(line);
		if (match && match[2] === name) return match[1].toLowerCase();
	}
	return undefined;
}
