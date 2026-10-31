/** Options for the temporary directory a config is loaded in. */
export interface ConfigSandboxOptions {
	/**
	 * A real `node_modules` directory to make visible from the sandbox. A config
	 * that does `import { defineConfig } from "@theholocron/cli"` only resolves
	 * if the directory it sits in has that package reachable by Node's upward
	 * `node_modules` search, so the sandbox gets a symlink to this one (not a
	 * copy — nothing is duplicated).
	 */
	nodeModules: string;
	/** Where to create the sandbox. Defaults to the OS temp dir. */
	root?: string;
	/** Prefix for the sandbox directory's name. */
	prefix?: string;
}
