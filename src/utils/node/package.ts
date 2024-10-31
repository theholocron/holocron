import { promises as fs } from "node:fs";
import * as path from "node:path";

export async function getPackage(dirPath: string): Promise<string | null> {
	try {
		const pkg = await fs.readFile(path.join(dirPath, "package.json"), "utf-8");

		return [null, JSON.parse(pkg)];
	} catch (error) {
		return [error];
	}
}
