import type { Leftover, ScannedFile } from "./tasks.type.js";

/**
 * Every use of an old dotted task name in `files`, with its file, line and replacement. A name matches as a whole token:
 * `delivery.build` is found in `turbo run delivery.build` and `delivery.build.yml`, not in `delivery.buildX`.
 * Files come back in the order given, lines top to bottom.
 */
export function findLeftovers(files: readonly ScannedFile[], names: Readonly<Record<string, string>>): Leftover[] {
	const escaped = Object.keys(names).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const pattern = new RegExp(`(?<![\\w.-])(${escaped.join("|")})(?![\\w-])`, "g");
	return files.flatMap((file) =>
		file.text.split("\n").flatMap((text, i) =>
			[...text.matchAll(pattern)].map((m) => ({
				file: file.path,
				line: i + 1,
				old: m[1]!,
				replacement: names[m[1]!]!,
			}))
		)
	);
}
