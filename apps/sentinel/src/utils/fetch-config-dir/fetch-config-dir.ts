import { ConfigFileError } from "@theholocron/datapad";

import { decodeContents } from "../decode-contents/index.js";
import { MAX_CONFIG_DIR_BYTES, MAX_CONFIG_DIR_FILE_BYTES, MAX_CONFIG_DIR_FILES } from "./fetch-config-dir.constants.js";
import type { FetchConfigDirInput, FetchConfigDirResult } from "./fetch-config-dir.type.js";

/**
 * Lists a directory of the repo (every level) and fetches its files, for a config directory such as `.holocron/`.
 * A directory that is not there is `[]`. Symlinks and submodules are skipped (nothing outside the tree is followed),
 * and every file is fetched, not only the area files, because an area file may import a sibling; which of them is
 * evaluated is decided later by what the config and the area files import.
 *
 * The tree comes from a repo anyone with write access can change, so it is capped: {@link MAX_CONFIG_DIR_FILES} files,
 * {@link MAX_CONFIG_DIR_FILE_BYTES} per file and {@link MAX_CONFIG_DIR_BYTES} in all. Past a cap this throws
 * `ConfigFileError` before fetching any file, rather than validating a partial tree.
 */
export async function fetchConfigDir(input: FetchConfigDirInput): Promise<FetchConfigDirResult> {
	const { client, repo, dir, ref } = input;
	const entries = await client.git.listDirectory(repo, dir, { ref, recursive: true });
	const files = entries.filter((entry) => entry.type === "file");

	if (files.length > MAX_CONFIG_DIR_FILES) {
		throw new ConfigFileError(`${dir}/ has ${files.length} files; the limit is ${MAX_CONFIG_DIR_FILES}`);
	}
	for (const file of files) {
		if (file.size > MAX_CONFIG_DIR_FILE_BYTES) {
			throw new ConfigFileError(`${file.path} is larger than ${MAX_CONFIG_DIR_FILE_BYTES / 1024} KB`);
		}
	}
	const total = files.reduce((sum, file) => sum + file.size, 0);
	if (total > MAX_CONFIG_DIR_BYTES) {
		throw new ConfigFileError(`${dir}/ is larger than ${MAX_CONFIG_DIR_BYTES / 1024} KB in all`);
	}

	return Promise.all(
		files.map(async (file) => {
			const contents = await client.git.getContents(repo, file.path, ref);
			return { path: file.path, content: decodeContents(contents.content) };
		})
	);
}
