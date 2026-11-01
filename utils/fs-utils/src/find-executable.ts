import { accessSync, constants, statSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Options for {@link findExecutable} and {@link findExecutableSync}. */
export interface FindExecutableOptions {
	/**
	 * Directories to search, delimited the way `PATH` is on `platform` (`:` on
	 * POSIX, `;` on Windows). Defaults to `process.env.PATH`. Empty entries are
	 * skipped rather than read as the working directory; relative ones are
	 * resolved against the working directory when the call starts.
	 */
	path?: string;
	/**
	 * Windows only: the extensions that make a file runnable, delimited with
	 * `;`. Defaults to `process.env.PATHEXT`, else `.COM;.EXE;.BAT;.CMD`. Each
	 * must be a bare extension — one with a path separator throws a `TypeError`,
	 * since it would otherwise reach outside the searched directory.
	 */
	pathExt?: string;
	/** Defaults to `process.platform`. Windows has no exec bit, so only the extension decides. */
	platform?: NodeJS.Platform;
}

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/** A bare command name, joined onto each search directory — never a path of its own. */
function assertBare(bin: string): void {
	if (bin === "" || bin === "." || bin === ".." || /[\\/]/.test(bin) || bin.includes("\0")) {
		throw new TypeError(`findExecutable: bin must be a bare command name, got ${JSON.stringify(bin)}`);
	}
}

/**
 * Every file name `bin` could run as in one directory, in the order they are
 * tried. Computed once per call so the order can't shift mid-search if the
 * environment changes underneath an in-flight lookup.
 */
function namesFor(bin: string, options: FindExecutableOptions): readonly string[] {
	if ((options.platform ?? process.platform) !== "win32") return [bin];
	const exts = (options.pathExt ?? process.env["PATHEXT"] ?? DEFAULT_PATHEXT).split(";").filter(Boolean);
	for (const ext of exts) {
		if (/[\\/]/.test(ext) || ext.includes("\0")) {
			throw new TypeError(
				`findExecutable: pathExt entries must not contain path separators, got ${JSON.stringify(ext)}`
			);
		}
	}
	// `git.exe` is already a full name; `git` needs an extension to run.
	if (exts.some((ext) => bin.toLowerCase().endsWith(ext.toLowerCase()))) return [bin];
	return exts.map((ext) => bin + ext);
}

/** The search directories, absolute, so a `chdir` during the awaits can't change what a relative entry means. */
function dirsOf(options: FindExecutableOptions): string[] {
	const win = (options.platform ?? process.platform) === "win32";
	return (options.path ?? process.env["PATH"] ?? "")
		.split(win ? ";" : ":")
		.filter(Boolean)
		.map((dir) => resolve(dir));
}

/** Only "nothing there" or "not runnable" means this candidate isn't it; anything else is real. */
const isMiss = (err: unknown): boolean => {
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM";
};

/**
 * The first runnable file named `bin` in `options.path` (default
 * `process.env.PATH`), as an absolute path, or `undefined`.
 * Directories and files without the exec bit don't count.
 *
 * `bin` must be a bare name — an empty string, `.`, `..` or anything with a
 * path separator throws a `TypeError`, as does any filesystem error other
 * than "not there" / "not permitted".
 *
 * On Windows, where there is no exec bit, `bin` is tried with each `PATHEXT`
 * extension unless it already ends in one (see {@link FindExecutableOptions}).
 *
 * @example
 * ```ts
 * import { findExecutableSync } from "@theholocron/fs-utils";
 *
 * // a project-local binary first, then the real PATH
 * const tsc = findExecutableSync("tsc", { path: join(cwd, "node_modules", ".bin") }) ?? findExecutableSync("tsc");
 * ```
 */
export async function findExecutable(bin: string, options: FindExecutableOptions = {}): Promise<string | undefined> {
	assertBare(bin);
	const win = (options.platform ?? process.platform) === "win32";
	const dirs = dirsOf(options);
	const names = namesFor(bin, options);
	for (const dir of dirs) {
		for (const name of names) {
			const candidate = join(dir, name);
			try {
				if (!(await stat(candidate)).isFile()) continue;
				if (!win) await access(candidate, constants.X_OK);
				return candidate;
			} catch (err) {
				if (!isMiss(err)) throw err;
			}
		}
	}
	return undefined;
}

/** Synchronous twin of {@link findExecutable}. */
export function findExecutableSync(bin: string, options: FindExecutableOptions = {}): string | undefined {
	assertBare(bin);
	const win = (options.platform ?? process.platform) === "win32";
	const dirs = dirsOf(options);
	const names = namesFor(bin, options);
	for (const dir of dirs) {
		for (const name of names) {
			const candidate = join(dir, name);
			try {
				if (!statSync(candidate).isFile()) continue;
				if (!win) accessSync(candidate, constants.X_OK);
				return candidate;
			} catch (err) {
				if (!isMiss(err)) throw err;
			}
		}
	}
	return undefined;
}
