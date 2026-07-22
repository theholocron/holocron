import "dotenv/config";
import type { EnvLoader } from "./types.js";

/**
 * Default loader — calls dotenv/config so the .env file is
 * read once, then returns process.env.
 *
 * Swap this out via `createEnvParser({ loader: new MyLoader() })`
 * if you ever need Vault, AWS SSM, dotenvx, etc.
 */
export class DotenvLoader implements EnvLoader {
	load(): Record<string, string | undefined> {
		return process.env;
	}
}
