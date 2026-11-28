/**
 * Thin wrapper around `spawnSync` for the Postman CLI (`postman`), the CLI-transport counterpart of `rest.ts`.
 *
 * The only thing it runs is `postman collection migrate <file> --output <dir>`, which writes a collection in
 * Postman's schema 3.0 YAML layout. The stdio shape is the usual one for a vendor CLI, `['inherit', 'pipe', 'pipe']`:
 * stdin stays attached so a CLI that wants a terminal can ask for one, and the output is read here.
 *
 * Not verified against the real CLI: it was not installed where this was written, so the arguments and the layout it
 * writes follow Postman's documentation and are exercised only through an injected `spawn`.
 */

import { spawnSync } from "node:child_process";

/** Options for {@link PostmanCli}. */
export interface PostmanCliOptions {
	/** Override the spawn function in tests. */
	spawn?: typeof spawnSync;
	/** The Postman CLI binary. Defaults to `"postman"`. */
	binary?: string;
}

/** Where to install the CLI, said when it is missing. */
export const INSTALL_HINT =
	"install it from https://learning.postman.com/docs/postman-cli/postman-cli-installation/ (macOS: brew install --cask postman-cli)";

/** The Postman CLI, run as a child process. */
export class PostmanCli {
	private readonly spawnImpl: typeof spawnSync;
	/** The binary this wrapper runs; defaults to `"postman"`. */
	readonly binary: string;

	constructor(opts: PostmanCliOptions = {}) {
		this.spawnImpl = opts.spawn ?? spawnSync;
		this.binary = opts.binary ?? "postman";
	}

	/**
	 * Runs `postman collection migrate <file> --output <outDir>` and throws when it cannot: the CLI is not installed,
	 * or it exits non-zero (its own message, trimmed, is the error).
	 */
	migrate(file: string, outDir: string): void {
		const out = this.spawnImpl(this.binary, ["collection", "migrate", file, "--output", outDir], {
			encoding: "utf-8",
			stdio: ["inherit", "pipe", "pipe"],
		});
		if (out.error) {
			const missing = (out.error as NodeJS.ErrnoException).code === "ENOENT";
			throw new Error(
				missing
					? `the Postman CLI (\`${this.binary}\`) is not installed: ${INSTALL_HINT}`
					: `could not run \`${this.binary}\`: ${out.error.message}`,
				{ cause: out.error }
			);
		}
		if (out.status !== 0) {
			const said = `${out.stderr ?? ""}`.trim() || `${out.stdout ?? ""}`.trim() || `exit status ${out.status}`;
			throw new Error(`\`${this.binary} collection migrate\` failed for ${file}: ${said}`);
		}
	}
}
