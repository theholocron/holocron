/** Whether a file carries the generated-file header in its first lines; drift in those is `probe generated check`'s to report. */
export function isGenerated(text: string): boolean {
	return text.split("\n", 3).some((line) => line.includes("AUTO-GENERATED"));
}
