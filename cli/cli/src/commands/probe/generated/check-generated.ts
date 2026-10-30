import type { GeneratedRepoFile } from "../../repo-files/index.js";
import { UNMANAGED_WORKFLOWS } from "./constants.js";

export interface CheckGeneratedInput {
	/** What the generator produced. */
	files: readonly GeneratedRepoFile[];
	/** What it produced a second time, to catch a generator that is not deterministic. */
	again: readonly GeneratedRepoFile[];
	/** The committed text of a file, or `null` when there is none. */
	read: (path: string) => string | null;
	/** Every file in `.github/workflows`, by file name, with its text. */
	workflows: ReadonlyMap<string, string>;
}

const WORKFLOWS_DIR = ".github/workflows/";

/** Where two texts first differ: the line number and both lines, cut to fit a terminal. */
function firstDifference(committed: string, generated: string): string {
	const a = committed.split("\n");
	const b = generated.split("\n");
	const line = a.findIndex((text, i) => text !== b[i]);
	const at = line === -1 ? Math.min(a.length, b.length) : line;
	const cut = (text: string | undefined) =>
		text === undefined ? "(end of file)" : JSON.stringify(text.slice(0, 80));
	return `first difference at line ${at + 1}: committed ${cut(a[at])}, generated ${cut(b[at])}`;
}

/** The package whose config generated a workflow, from its `# Source package:` marker (`.` is the root). */
function sourcePackage(text: string): string | null {
	return /^# Source package: (.+)$/m.exec(text)?.[1] ?? null;
}

/**
 * Problems with the generated files, as human-readable lines: a file that differs from the committed copy or is
 * missing, a file whose second generation differs from the first, and a workflow that nothing generates and that is not
 * marked as someone else's (hand-maintained, from another package's config, or on the unmanaged list).
 */
export function checkGenerated({ files, again, read, workflows }: CheckGeneratedInput): string[] {
	const problems: string[] = [];
	const second = new Map(again.map((f) => [f.path, f.content]));
	for (const file of files) {
		const committed = read(file.path);
		if (committed === null) {
			problems.push(`${file.path}: missing; run \`holocron repo setup\` or \`holocron repo sync\` and commit it`);
		} else if (committed !== file.content) {
			problems.push(
				`${file.path}: differs from what holocron generates (${firstDifference(committed, file.content)}); run \`holocron repo setup\` or \`holocron repo sync\` and commit the result`
			);
		}
		if (second.get(file.path) !== file.content) {
			problems.push(`${file.path}: generating it twice gives different content`);
		}
	}

	const generated = new Set(files.map((f) => f.path));
	for (const [name, text] of workflows) {
		const path = `${WORKFLOWS_DIR}${name}`;
		if (generated.has(path) || name in UNMANAGED_WORKFLOWS || text.startsWith("# HAND-MAINTAINED")) continue;
		const source = sourcePackage(text);
		// Generated from another package's config (apps/sentinel's tasks): that package's own sync checks it.
		if (text.startsWith("# AUTO-GENERATED") && source !== null && source !== ".") continue;
		problems.push(
			`${path}: no task generates it and it is not marked "# HAND-MAINTAINED"; remove it, or mark it hand-maintained`
		);
	}
	return problems;
}
