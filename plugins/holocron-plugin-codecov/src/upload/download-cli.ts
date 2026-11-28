import { join } from "node:path";

import { parseChecksum } from "./parse-checksum.js";
import { retryWithWait } from "./retry-with-wait.js";
import { sha256Matches } from "./sha256-matches.js";
import type { DownloadCliDeps } from "./upload.type.js";
import { verifySignature } from "./verify-signature.js";

/** Where Codecov publishes its CLI (the Linux build), its checksum file and the signature of that file. */
export const CODECOV_CLI_BASE = "https://cli.codecov.io/latest/linux";

/** Where the key that signs the checksum file is published. */
export const CODECOV_SIGNING_KEY_URL = "https://keybase.io/codecovsecops/pgp_keys.asc";

/** What {@link downloadCli} takes. */
export interface DownloadCliInput {
	/** A fresh folder the files and the private `gpg` home go in. */
	dir: string;
	/** Everything outside the function. */
	deps: DownloadCliDeps;
	/** Waits between the tries of a download. */
	sleep: (ms: number) => Promise<void>;
}

async function getBytes(deps: DownloadCliDeps, sleep: (ms: number) => Promise<void>, url: string): Promise<Uint8Array> {
	return retryWithWait({
		attempts: 3,
		waitMs: (n) => n * 1000,
		sleep,
		attempt: async () => {
			const res = await deps.fetch(url);
			if (!res.ok) throw new Error(`${url} answered ${res.status}`);
			return new Uint8Array(await res.arrayBuffer());
		},
	});
}

/**
 * Downloads the Codecov CLI, its checksum file, the signature and the signing key into `dir`, checks the signature of the
 * checksum file with `gpg` and the binary's digest against it, and makes the binary executable. Returns its path.
 * Throws, naming what failed, when anything does not check out: nothing unverified is ever made executable.
 */
export async function downloadCli(input: DownloadCliInput): Promise<string> {
	const { dir, deps, sleep } = input;
	const decoder = new TextDecoder();
	const binary = await getBytes(deps, sleep, `${CODECOV_CLI_BASE}/codecov`);
	const sums = await getBytes(deps, sleep, `${CODECOV_CLI_BASE}/codecov.SHA256SUM`);
	const signature = await getBytes(deps, sleep, `${CODECOV_CLI_BASE}/codecov.SHA256SUM.sig`);
	const key = decoder.decode(await getBytes(deps, sleep, CODECOV_SIGNING_KEY_URL));

	const binaryPath = join(dir, "codecov");
	const sumsPath = join(dir, "codecov.SHA256SUM");
	const signaturePath = join(dir, "codecov.SHA256SUM.sig");
	const gnupgHome = join(dir, "gnupg");
	deps.makeDir(dir);
	deps.makeDir(gnupgHome, 0o700);
	deps.writeFile(binaryPath, binary);
	deps.writeFile(sumsPath, sums);
	deps.writeFile(signaturePath, signature);

	if (!verifySignature({ publicKey: key, checksumPath: sumsPath, signaturePath, gnupgHome, spawn: deps.spawn })) {
		throw new Error("the Codecov CLI's checksum file is not signed by Codecov's key (gpg did not accept it)");
	}
	const expected = parseChecksum(decoder.decode(sums), "codecov");
	if (expected === undefined) throw new Error("the Codecov CLI's checksum file has no digest for `codecov`");
	if (!sha256Matches(binary, expected)) throw new Error("the Codecov CLI's digest does not match its checksum file");
	deps.makeExecutable(binaryPath);
	return binaryPath;
}
