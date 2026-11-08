import type { GeneratedRepoFile } from "../../repo-files/index.js";
import { UNMANAGED_WORKFLOWS } from "./constants.js";

/** The workflows one workspace package's own config generates into the repo's `.github/workflows`. */
export interface PackageGenerated {
	/** The package's folder, relative to the repository root (`apps/sentinel`), as in its `# Source package:` marker. */
	path: string;
	/** What its config generated. */
	files: readonly GeneratedRepoFile[];
	/** What it generated a second time, to catch a generator that is not deterministic. */
	again: readonly GeneratedRepoFile[];
}

export interface CheckGeneratedInput {
	/** What the generator produced. */
	files: readonly GeneratedRepoFile[];
	/** What it produced a second time, to catch a generator that is not deterministic. */
	again: readonly GeneratedRepoFile[];
	/** What each workspace package with a config of its own generates; none when omitted. */
	packages?: readonly PackageGenerated[];
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

/**
 * Problems with the generated files, as human-readable lines: a file that differs from the committed copy or is
 * missing, a file whose second generation differs from the first, and a workflow that nothing generates and that is not marked as someone else's (hand-maintained or on the
 * unmanaged list). The files a workspace package's config generates are checked the same way as the root's, and a
 * problem with one names the package and the command that writes it.
 */
export function checkGenerated({ files, again, packages = [], read, workflows }: CheckGeneratedInput): string[] {
	const problems: string[] = [];
	const written = new Set<string>();
	const scopes = [
		{
			from: "",
			fix: "`holocron repo setup` or `holocron repo sync`",
			files,
			again,
		},
		...packages.map((pkg) => ({
			from: ` for package ${pkg.path}`,
			fix: `\`holocron repo sync --cwd ${pkg.path}\``,
			files: pkg.files,
			again: pkg.again,
		})),
	];
	for (const scope of scopes) {
		const second = new Map(scope.again.map((f) => [f.path, f.content]));
		for (const file of scope.files) {
			// Two configs write it (a package's preset adds the root's tasks): the first, the root's, is the one checked,
			// as `repo sync --cwd <package>` refuses to overwrite it (holocron#1026). `sharedWorkflows` reports it.
			if (written.has(file.path)) continue;
			written.add(file.path);
			const committed = read(file.path);
			if (committed === null) {
				problems.push(`${file.path}: missing${scope.from}; run ${scope.fix} and commit it`);
			} else if (committed !== file.content) {
				problems.push(
					`${file.path}: differs from what holocron generates${scope.from} (${firstDifference(committed, file.content)}); run ${scope.fix} and commit the result`
				);
			}
			if (second.get(file.path) !== file.content) {
				problems.push(`${file.path}: generating it twice gives different content`);
			}
		}
	}

	for (const [name, text] of workflows) {
		const path = `${WORKFLOWS_DIR}${name}`;
		if (written.has(path) || name in UNMANAGED_WORKFLOWS || text.startsWith("# HAND-MAINTAINED")) continue;
		problems.push(
			`${path}: no task generates it and it is not marked "# HAND-MAINTAINED"; remove it, or mark it hand-maintained`
		);
	}
	return problems;
}
