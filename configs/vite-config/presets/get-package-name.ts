import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function getPackageName() {
	try {
		const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")) as { name?: string };
		return pkg.name ?? "unknown";
	} catch {
		return "unknown";
	}
}
