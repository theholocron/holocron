import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type CLIOptions } from "@/cli";
import { HOME, SYSTEM_IGNORED_FOLDERS, type IgnoredFolders } from "@/const";
import { type Return } from "@/types";
import { $, config, log } from "@/utils";

export type Project = Record<string, string>;
export interface FindProjectsOpts extends CLIOptions {
	maxSearchDepth?: number;
}

const FN = "find.projects";

/**
 * Searches directory for any Node.js project (by detecting package.json), ignoring hidden directories.
 *
 * @param {string} [location] - Directory path to search within.
 * @param {FindProjectsOpts} [options] - Additional options for customization.
 * @returns {Promise<Return<Project[]>>} An error or an array of locations with all of the file paths found.
 */
export async function findProjects(location?: string, options: FindProjectsOpts = {}): Promise<Return<Project[]>> {
	log.data(FN, "arguments", { location, ...options }, options);
	const start = performance.now();
	const maxDepth: number = options?.maxSearchDepth || 5;
	const results: Project[] = [];
	const loc: string = location || HOME;

	async function searchDirectory(cwd: string, depth: number = 0): Promise<void> {
		log.process(FN, `searching in ${cwd}`, options);
		let files: string[];
		try {
			files = await fs.readdir(cwd);
		} catch {
			return;
		}

		log.data(FN, "files", files, options);
		for (const file of files) {
			if (
				file.startsWith(".") ||
				SYSTEM_IGNORED_FOLDERS.includes(file as IgnoredFolders) ||
				config.get("preferences.ignoredFolders").includes(file)
			) {
				continue; // skip all of these files, folders
			}

			const filePath = path.join(cwd, file);
			log.process(FN, `checking if ${filePath} is a directory`, options);
			const [, dir] = await $.directory(filePath);
			// if there are no files in it, its not a folder i care about
			if (!dir?.files.length || !dir?.path) {
				continue;
			}

			log.data(FN, "isValidDirectory", dir?.path ?? "", options);

			if (dir.files.includes(path.join(dir.path, "package.json"))) {
				// Node.js project detected
				const pkg = await fs.readFile(path.join(dir.path, "package.json"), "utf-8");
				const packageData = JSON.parse(pkg);
				results.push({
					name: packageData.name,
					value: dir.path,
				});
			} else if (maxDepth === -1 || depth < maxDepth) {
				await searchDirectory(filePath, depth + 1);
			}
		}
	}

	await searchDirectory(loc);

	const end = performance.now();
	return [null, results, end - start];
}
