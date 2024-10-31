import { promises as fs, Dirent } from "node:fs";
import * as path from "node:path";
import { HOME } from "@/const";
import { type Return } from "@/types";
import { expandTilde, isHidden, isIgnored } from "./utils";

export function getDirectoryByLevel(filepath: string, size: number = -3): string {
	// Normalize the file path and split it into parts
	const parts = path.normalize(filepath).split(path.sep);

	// Remove the home directory path if present
	if (filepath.startsWith(HOME)) {
		parts.splice(0, HOME.split(path.sep).length);
	}

	// Slice the last 3 directories, but if the third directory from the end is not the home directory, keep all three
	const lastDirs = parts.slice(size);

	// If three parts are kept, only return last two if the third last was home directory
	return lastDirs.join(path.sep);
}

export async function isDirectory(pathname: string, options: object = {}): Promise<boolean> {
	const resolvedPath = expandTilde(pathname);

	try {
		const stat = await fs.stat(resolvedPath, options);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

export async function readDirectory(
	pathname: string,
	maxDepth: number = Infinity,
	currentDepth: number = 0,
	options: object = {}
): Promise<string[]> {
	const resolvedPath = expandTilde(pathname);
	const files: string[] = [];

	try {
		const dirents: Dirent[] = await fs.readdir(resolvedPath, { withFileTypes: true, ...options });

		for (const dirent of dirents) {
			const fullPath = `${resolvedPath}/${dirent.name}`;
			if (dirent.isDirectory()) {
				if (!isHidden(dirent.name) && !isIgnored(dirent.name) && currentDepth < maxDepth) {
					files.push(...(await readDirectory(fullPath, maxDepth, currentDepth + 1)));
				}
			} else {
				files.push(fullPath);
			}
		}

		return files;
	} catch {
		return [];
	}
}

export async function writeDirectory(pathname: string, options: object = {}): Promise<Return<string>> {
	const resolvedPath = expandTilde(pathname);

	if (await isDirectory(resolvedPath)) {
		return [null, resolvedPath, 0];
	}

	try {
		await fs.mkdir(resolvedPath, { recursive: true, ...options });
		return [null, resolvedPath, 0];
	} catch (error) {
		return [error as Error, null, 0];
	}
}

export interface Directory {
	files: string[];
	path: string;
}

export async function directory(pathname: string, maxDepth: number = Infinity): Promise<Return<Directory>> {
	// if its a directory, return the resolved path and files
	if (await isDirectory(pathname)) {
		const files = await readDirectory(pathname, maxDepth);
		return [
			null,
			{
				files,
				path: expandTilde(pathname),
			},
			0,
		];
	}

	// if it doesn't exist, attempt to create it and return resolved path
	// if it's a file or something other than a directory, it will throw an error
	const [writeErr] = await writeDirectory(pathname);
	return [
		writeErr,
		{
			files: [],
			path: expandTilde(pathname),
		},
		0,
	];
}
