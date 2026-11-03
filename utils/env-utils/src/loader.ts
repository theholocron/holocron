import { config } from "dotenv";

import type { EnvLoader } from "./types.js";

/**
 * Default loader. The first `load()` reads a `.env` from the working directory
 * through dotenv (variables already in the environment win), and every `load()`
 * returns `process.env`.
 *
 * Nothing is read when the package is imported: a `.env` is loaded only when a
 * loader is asked to `load()`, which `createEnvParser` does when it defaults to
 * this class. Importing only the lookup helpers never reads a file.
 *
 * Swap this out via `createEnvParser({ loader: new MyLoader() })`
 * if you ever need Vault, AWS SSM, dotenvx, etc.
 */
export class DotenvLoader implements EnvLoader {
	private loaded = false;

	/** Loads `.env` from the working directory through dotenv once, then returns `process.env`. */
	load(): Record<string, string | undefined> {
		if (!this.loaded) {
			config({ quiet: true });
			this.loaded = true;
		}
		return process.env;
	}
}
