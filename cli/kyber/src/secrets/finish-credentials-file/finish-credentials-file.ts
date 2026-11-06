import { closeSync } from "node:fs";

import { describeError } from "../../ui/describe-error/index.js";
import { waitForEnter } from "../../ui/wait-for-enter/index.js";
import { shredFile } from "../shred-file/index.js";
import type { FinishCredentialsFileInput } from "./finish-credentials-file.type.js";

/** Signals that end the wait for the import, with the exit status each is conventionally reported as. */
const INTERRUPTS = [
	["SIGINT", 130],
	["SIGTERM", 143],
	["SIGHUP", 129],
] as const;

/**
 * Once the lines are in the private file, says what to do with it and, on a terminal, deletes it when the import is
 * done. Returns whether the file is gone (or was left on purpose): `false` means plaintext secrets are still on disk.
 */
export async function finishCredentialsFile(input: FinishCredentialsFileInput): Promise<boolean> {
	const { path, identity, print } = input;
	print(`wrote ${path} (readable only by you)`);
	print(input.importHint);
	if (input.keep || !input.interactive) {
		// The file stays, so the descriptor held for its cleanup is no longer needed.
		closeSync(identity.fd);
		print(`it holds ${input.holds} in plain text: delete it when you are done: ${path}`);
		return true;
	}
	// Reports what happened to the file honestly: "deleted" only when it was, and what to do when it was not.
	const cleanup = (): boolean => {
		try {
			const outcome = (input.shred ?? shredFile)(path, identity);
			if (outcome === "deleted") print(`deleted ${path}`);
			else if (outcome === "missing") print(`${path} was already gone`);
			else print(`left ${path} alone: it is no longer the file this command wrote`);
			return true;
		} catch (err) {
			print(`could not delete ${path}: ${describeError(err)}`);
			print(`it holds ${input.holds} in plain text: delete it yourself: ${path}`);
			return false;
		}
	};
	// Ctrl-C, a terminated process and a closed terminal must not leave the file behind.
	const handlers = INTERRUPTS.map(([signal, code]) => {
		const handler = () => {
			cleanup();
			process.exit(code);
		};
		process.once(signal, handler);
		return [signal, handler] as const;
	});
	let cleaned: boolean;
	try {
		await (input.waitForImport ?? waitForEnter)(
			"press Enter when the import is done and the file will be deleted: "
		);
	} finally {
		for (const [signal, handler] of handlers) process.off(signal, handler);
		// Also when the wait threw: the file must not outlive the command.
		cleaned = cleanup();
	}
	return cleaned;
}
