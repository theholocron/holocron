/** Puts `text` on the system clipboard through `clipboardy`, which uses the platform's own tool. Loaded only when called. */
export async function copyToClipboard(text: string): Promise<void> {
	const { default: clipboard } = await import("clipboardy");
	await clipboard.write(text);
}
