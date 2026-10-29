import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function getPackageName() {
	try {
		return JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")).name ?? "unknown";
	} catch {
		return "unknown";
	}
}
