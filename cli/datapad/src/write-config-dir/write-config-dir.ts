import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { ConfigFileError } from "../errors/index.js";
import type { WriteConfigDirOptions } from "./write-config-dir.type.js";

/**
 * Write the files fetched from a config directory (`.holocron/…`) into the sandbox beside the config, keeping each
 * relative path, so {@link loadConfigDir} finds them and an area file that imports a sibling resolves it. Creates the
 * sub-directories as needed and returns the absolute paths written. Throws {@link ConfigFileError} for a path that is
 * absolute or leaves `dir`, because the paths come from a remote tree and must never write outside the sandbox; it
 * checks every path before it writes any.
 */
export async function writeConfigDir(options: WriteConfigDirOptions): Promise<string[]> {
	const root = resolve(options.dir);
	const targets = options.files.map((file) => {
		const target = resolve(root, file.path);
		const rel = relative(root, target);
		if (isAbsolute(file.path) || rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
			throw new ConfigFileError(`refusing to write ${file.path}: it is not inside ${options.dir}`, target);
		}
		return { target, content: file.content };
	});
	for (const { target, content } of targets) {
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
	}
	return targets.map(({ target }) => target);
}
