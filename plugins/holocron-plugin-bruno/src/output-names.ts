import { basename, extname } from "node:path";

/**
 * The YAML file name for each collection file, in order: its own name with `.yml` for `.json` (`collection.json` is
 * `collection.yml`). Two files with the same name would overwrite each other, so those use the whole path instead,
 * its folders joined with `-` (`apps-a-collection.yml`).
 */
export function outputNames(files: string[]): string[] {
	const stem = (file: string) => basename(file, extname(file));
	const counts = new Map<string, number>();
	for (const file of files) counts.set(stem(file), (counts.get(stem(file)) ?? 0) + 1);
	return files.map((file) => {
		if (counts.get(stem(file)) === 1) return `${stem(file)}.yml`;
		const whole = file.slice(0, file.length - extname(file).length);
		return `${whole.split("/").filter(Boolean).join("-")}.yml`;
	});
}
