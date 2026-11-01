import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePackageJson } from "./parse-package-json.ts";

/** A package manager that {@link detectPackageManager} can report. */
export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

/** Options for {@link detectPackageManager}. */
export interface DetectPackageManagerOptions {
	/** Replaces the `package.json` read — for callers with an injected or in-memory filesystem. */
	readFile?: (path: string) => string;
	/** Replaces the lockfile existence check. */
	fileExists?: (path: string) => boolean;
	/** Returned when neither `package.json` nor a lockfile says. Defaults to `"pnpm"`. */
	fallback?: PackageManager;
}

const MANAGERS: readonly string[] = ["pnpm", "npm", "yarn", "bun"];

/** Checked in this order; the first lockfile present wins. */
const LOCKFILES: ReadonlyArray<readonly [file: string, manager: PackageManager]> = [
	["pnpm-lock.yaml", "pnpm"],
	["bun.lockb", "bun"],
	["bun.lock", "bun"],
	["yarn.lock", "yarn"],
	["npm-shrinkwrap.json", "npm"],
	["package-lock.json", "npm"],
];

/**
 * The package manager `dir` uses: the name in `package.json#packageManager`
 * (`pnpm@10.0.0` → `pnpm`) when it's one of pnpm, npm, yarn or bun, else the
 * first lockfile found (`pnpm-lock.yaml`, `bun.lockb`, `bun.lock`, `yarn.lock`, `npm-shrinkwrap.json`,
 * `package-lock.json`, in that order), else `options.fallback`.
 *
 * @example
 * ```ts
 * import { detectPackageManager } from "@theholocron/pkg-utils";
 *
 * detectPackageManager(process.cwd()); // "pnpm" | "npm" | "yarn" | "bun"
 * ```
 */
export function detectPackageManager(dir: string, options: DetectPackageManagerOptions = {}): PackageManager {
	const read = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
	const exists = options.fileExists ?? existsSync;

	let declared: string | undefined;
	try {
		const field = parsePackageJson(read(join(dir, "package.json")))?.packageManager;
		declared = typeof field === "string" ? field.split("@")[0] : undefined;
	} catch {
		// no readable package.json — fall through to the lockfiles
	}
	if (declared && MANAGERS.includes(declared)) return declared as PackageManager;

	for (const [file, manager] of LOCKFILES) if (exists(join(dir, file))) return manager;
	return options.fallback ?? "pnpm";
}
