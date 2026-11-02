import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** A text file named in a config is a few paragraphs; this only keeps a wrong file from filling memory. */
export const MAX_REPO_TEXT_BYTES = 100 * 1024;

/** Whether a path relative to the root climbs out of it. */
const escapes = (rel: string): boolean => rel === ".." || rel.startsWith(`..${sep}`);

/**
 * Read a text file the repository holds, named by a path relative to its root.
 *
 * The path is the repository's, wherever the command is run from, and it must stay inside: an absolute path, a
 * `..` that climbs out, and a link that leads outside are all refused, so a config cannot point a command at
 * a file the repository does not own. Throws, with a reason that fits after "could not be read:", when it cannot
 * be read.
 */
export async function readRepoText(root: string, file: string): Promise<string> {
	if (isAbsolute(file)) throw new Error("it must be a path inside the repository, not an absolute one");
	const path = resolve(root, file);
	if (escapes(relative(root, path))) throw new Error("it points outside the repository");
	// The lexical check cannot see a link, so the real location is checked too.
	const real = await realpath(path);
	if (escapes(relative(await realpath(root), real))) throw new Error("it points outside the repository");
	const info = await stat(real);
	if (!info.isFile()) throw new Error("it is not a file");
	if (info.size > MAX_REPO_TEXT_BYTES) throw new Error(`it is larger than ${MAX_REPO_TEXT_BYTES / 1024} KB`);
	return readFile(real, "utf8");
}
