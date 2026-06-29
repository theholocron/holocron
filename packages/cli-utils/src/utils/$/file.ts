import { promises as fs } from "node:fs";
import * as str from "@theholocron/utils-string";
import { type Return } from "@/types";
import { expandTilde } from "./utils";

const encoding = "utf-8";

export async function isFile(pathname: string, options: object = {}): Promise<boolean> {
	const resolvedPath = expandTilde(pathname);

	try {
		const stat = await fs.stat(resolvedPath, options);
		return stat.isFile();
	} catch {
		return false;
	}
}

export interface File {
	path: string;
	content: string;
}

export async function readFile(pathname: string | string[], options: object = {}): Promise<File[]> {
	const files = str.toArray(pathname);
	const results: File[] = [];

	for (const file of files) {
		const resolvedPath = expandTilde(file);

		try {
			const content = await fs.readFile(resolvedPath, { encoding, ...options });
			results.push({
				content,
				path: resolvedPath,
			});
		} catch {
			results.push({
				content: "",
				path: resolvedPath,
			});
		}
	}

	return results;
}

export async function writeFile(
	pathname: string,
	content?: string | Buffer,
	overwrite: boolean = false,
	options: object = {}
): Promise<Return<File>> {
	const resolvedPath = expandTilde(pathname);

	if (!content) {
		const [data] = await readFile(resolvedPath);
		return [null, data, 0];
	}

	try {
		if (overwrite) {
			await fs.writeFile(resolvedPath, content, { encoding, ...options });
		} else {
			await fs.appendFile(resolvedPath, content, { encoding, ...options });
		}

		const [data] = await readFile(resolvedPath);
		return [null, data, 0];
	} catch (error) {
		return [error as Error, null, 0];
	}
}

// only handles single files
export async function file(
	pathname: string,
	content?: string | Buffer,
	overwrite: boolean = false
): Promise<Return<File>> {
	// if its a file and there's no content, return the resolved path and contents
	if ((await isFile(pathname)) && !content) {
		const [contents] = await readFile(pathname);
		return [null, contents, 0];
	}

	// if it doesn't exist, attempt to create it and return resolved path
	// if it's a file or something other than a directory, it will throw an error
	const [writeErr, write] = await writeFile(pathname, content, overwrite);
	return [
		writeErr,
		{
			content: write?.content ?? "",
			path: write?.path ?? "",
		},
		0,
	];
}
