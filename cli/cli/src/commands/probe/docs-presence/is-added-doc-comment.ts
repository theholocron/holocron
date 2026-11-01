/** Whether a line of a unified diff adds part of a doc comment: its `/**` opener, a ` * text` line or the closer. */
export function isAddedDocComment(line: string): boolean {
	return /^\+\s*(\/\*\*|\*(\s|\/|$))/.test(line);
}
