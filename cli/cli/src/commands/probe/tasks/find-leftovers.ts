import { ALLOW_MARKER } from "./allow-marker.js";
import { findReserved } from "./find-reserved.js";
import { scriptKeys } from "./script-keys.js";
import type { FindOptions, Leftover, ScannedFile } from "./tasks.type.js";

/** The commands that take a task name as their next word: `holocron run`, `turbo run`, `pnpm run`, `pnpm`, ... */
const COMMAND = String.raw`(?:holocron run|turbo run|pnpm run|npm run|pnpm|yarn)\s+`;

/** A regex alternation of `names`, escaped; matches nothing for an empty list. */
function alternation(names: readonly string[]): string {
	return names.length === 0 ? "(?!)" : names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

/** The field of a manifest whose keys are tasks or scripts: `scripts` in a `package.json`, `tasks` in a `turbo.json`. */
function taskField(path: string): string | undefined {
	return /(^|\/)package\.json$/.test(path) ? "scripts" : /(^|\/)turbo\.json$/.test(path) ? "tasks" : undefined;
}

/**
 * Every use of an old task name in `files`, with its file, line and replacement.
 *
 * - A dotted name (`delivery.build`) matches as a whole token: found in `turbo run delivery.build`, not in
 *   `delivery.buildX`. Followed by `.yml`/`.yaml` it is a workflow file name and is left out unless `options.files`.
 * - A bare name (`review`, `stale`: the keys of `names` without a dot) is an ordinary word, so it is found only where it
 *   is used as a task: after `holocron run`, `turbo run`, `pnpm` or `pnpm run`, as a `package.json` script or as a
 *   `turbo.json` task.
 * - A `package.json` script named like an npm/pnpm lifecycle word is reported too (see {@link findReserved}).
 * - A line, or the line below one, that carries the {@link ALLOW_MARKER} is skipped.
 *
 * Files come back in the order given, lines top to bottom.
 */
export function findLeftovers(
	files: readonly ScannedFile[],
	names: Readonly<Record<string, string>>,
	options: FindOptions = {}
): Leftover[] {
	const dotted = Object.keys(names).filter((n) => n.includes("."));
	const bare = Object.keys(names).filter((n) => !n.includes("."));
	const tail = options.files ? String.raw`(?![\w-])` : String.raw`(?![\w-]|\.ya?ml\b)`;
	const dottedPattern = new RegExp(`(?<![\\w.-])(${alternation(dotted)})${tail}`, "g");
	const barePattern = new RegExp(`(?<![\\w.-])${COMMAND}(${alternation(bare)})(?![\\w:-]|\\.\\w)`, "g");
	return files.flatMap((file) => {
		const lines = file.text.split("\n");
		const field = taskField(file.path);
		const inText = lines.flatMap((text, i) =>
			[...text.matchAll(dottedPattern), ...text.matchAll(barePattern)].map((m) => ({
				file: file.path,
				line: i + 1,
				old: m[1]!,
				replacement: names[m[1]!]!,
			}))
		);
		const asKey = (field === undefined ? [] : scriptKeys(file.text, field))
			.filter(({ key }) => bare.includes(key))
			.map(({ key, line }) => ({ file: file.path, line, old: key, replacement: names[key]! }));
		const seen = new Set<string>();
		return [...inText, ...asKey, ...findReserved(file)]
			.sort((a, b) => a.line - b.line)
			.filter(({ line, old }) => !seen.has(`${line}:${old}`) && seen.add(`${line}:${old}`))
			.filter(({ line }) => !lines[line - 1]!.includes(ALLOW_MARKER) && !lines[line - 2]?.includes(ALLOW_MARKER));
	});
}
