/** Whether an lcov report names at least one source file (a line starting `SF:`); one that names none is rejected as empty. */
export function namesSourceFile(content: string): boolean {
	return content.split("\n").some((line) => line.startsWith("SF:"));
}
