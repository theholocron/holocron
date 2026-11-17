import { basename, extname } from "node:path";

/** A file's path with its extension and a trailing `.collection` taken off (`api/webhook.collection.json` is `api/webhook`). */
const withoutSuffix = (file: string): string =>
	file.slice(0, file.length - extname(file).length).replace(/\.collection$/, "");

/**
 * The output file name for each collection file, in order: its own name with `extension` in place of `.json`, and
 * without a `.collection` part (`api/webhook.collection.json` is `webhook.bruno.json`; `collection.json` is
 * `collection.bruno.json`). Two files with the same name would overwrite each other, so those use the whole path instead, its
 * folders joined with `-` (`apps-a-collection.bruno.json`).
 */
export function outputNames(files: string[], extension = ".bruno.json"): string[] {
	const stem = (file: string) => basename(withoutSuffix(file));
	const counts = new Map<string, number>();
	for (const file of files) counts.set(stem(file), (counts.get(stem(file)) ?? 0) + 1);
	return files.map((file) => {
		if (counts.get(stem(file)) === 1) return `${stem(file)}${extension}`;
		return `${withoutSuffix(file).split("/").filter(Boolean).join("-")}${extension}`;
	});
}
