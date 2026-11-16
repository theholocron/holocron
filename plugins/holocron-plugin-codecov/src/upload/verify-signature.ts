import type { SpawnFn } from "./upload.type.js";

/** What {@link verifySignature} needs. */
export interface VerifySignatureInput {
	/** The ASCII-armoured public key that signs the checksum file. */
	publicKey: string;
	/** Path of the checksum file. */
	checksumPath: string;
	/** Path of the detached signature of the checksum file. */
	signaturePath: string;
	/** A private, empty `gpg` home folder for this check, so the runner's own keyring is never touched. */
	gnupgHome: string;
	/** Spawns `gpg`. */
	spawn: SpawnFn;
}

/** Imports the signing key into a private keyring and checks the detached signature; `true` only when `gpg` accepts it. */
export function verifySignature(input: VerifySignatureInput): boolean {
	const home = ["--homedir", input.gnupgHome, "--batch"];
	const imported = input.spawn("gpg", [...home, "--import"], { input: input.publicKey, encoding: "utf-8" });
	if (imported.error || imported.status !== 0) return false;
	const checked = input.spawn("gpg", [...home, "--verify", input.signaturePath, input.checksumPath], {
		encoding: "utf-8",
	});
	return !checked.error && checked.status === 0;
}
