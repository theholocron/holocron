import editorconfigChecker from "./editorconfig-checker.json";

export function createConfig(): string {
	return JSON.stringify(editorconfigChecker, null, 2) + "\n";
}
