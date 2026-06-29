import { promises as fs } from "node:fs";
import { type Return } from "@/types";
import { isDirectory } from "./directory";
import { isFile } from "./file";
import { expandTilde } from "./utils";

export async function removeFile(pathname: string, options: object = {}): Promise<boolean> {
	const resolvedPath = expandTilde(pathname);

	try {
		await fs.rm(resolvedPath, options);
		return true;
	} catch {
		return false;
	}
}

export async function removeDirectory(pathname: string, options: object = {}): Promise<boolean> {
	const resolvedPath = expandTilde(pathname);

	try {
		await fs.rmdir(resolvedPath, options);
		return true;
	} catch {
		return false;
	}
}

export async function remove(pathname: string, options: object = {}): Promise<Return<boolean>> {
	const resolvedPath = expandTilde(pathname);

	try {
		if (await isDirectory(resolvedPath)) {
			await fs.rmdir(resolvedPath, { recursive: true, ...options });
			return [null, true, 0];
		}

		if (await isFile(resolvedPath)) {
			await fs.rm(resolvedPath, options);
			return [null, true, 0];
		}

		return [new Error(`Path does not exist: ${resolvedPath}`), null, 0];
	} catch (error) {
		return [error as Error, false, 0];
	}
}
