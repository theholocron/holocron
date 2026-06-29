import { promises as fs } from "node:fs";
import { expandTilde } from "./utils";

export async function path(pathname: string): Promise<boolean> {
	const resolvedPath = expandTilde(pathname);

	try {
		await fs.access(resolvedPath);
		return true;
	} catch {
		return false;
	}
}
