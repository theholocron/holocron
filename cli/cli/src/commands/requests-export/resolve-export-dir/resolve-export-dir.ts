import { dirname, join, relative, resolve, sep } from "node:path";

import type { ResolvedExportDir, ResolveExportDirInput } from "./resolve-export-dir.type.js";

/** Whether `path` is `folder` itself or somewhere below it. */
const within = (path: string, folder: string): boolean => {
	const rel = relative(folder, path);
	return !(rel === ".." || rel.startsWith(`..${sep}`));
};

/**
 * The folder one provider's export is written to: `<out>/<provider>`, where `out` is `--out`, else `.export` beside the
 * first collection file (`requests/.export/postman`, git-ignored). The folder is refused when it is, or contains, a
 * source file's folder: an export never writes where the source files are, so it cannot overwrite the one source.
 * A folder below the source folder is fine.
 */
export function resolveExportDir(input: ResolveExportDirInput): ResolvedExportDir {
	const { repoRoot, provider, files, out } = input;
	const first = files[0];
	let parent: string;
	if (out !== undefined) parent = resolve(repoRoot, out);
	else if (first !== undefined) parent = join(dirname(resolve(repoRoot, first)), ".export");
	else return { ok: false, message: "it names no collection file, so there is no folder to put `.export` next to" };
	const dir = join(parent, provider);
	for (const file of files) {
		if (within(dirname(resolve(repoRoot, file)), dir)) {
			return { ok: false, message: `${dir} is, or holds, the folder of ${file}; an export never writes there` };
		}
	}
	return { ok: true, dir };
}
