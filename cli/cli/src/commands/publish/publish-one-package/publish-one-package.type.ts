import type { PublicPackageEntry } from "../public-package-entry.type.js";
import type { PublishExecResult, PublishPrint } from "../publish.type.js";

/**
 * How one package's publish ended: `published`; `concurrent` (the version was on the registry after a failed call,
 * another run made it); `failed` (not a sigstore 409); `tlog-conflict` (a sigstore 409 on every try: an identical
 * tarball is already in the transparency log). `message` is the failure text of the last try.
 */
export type PublishOnePackageResult =
	{ outcome: "published" | "concurrent" } | { outcome: "failed" | "tlog-conflict"; message: string };

export interface PublishOnePackageInput {
	entry: PublicPackageEntry;
	/** Everything after `pnpm`: `--filter <dir> publish ...`. */
	publishArgs: readonly string[];
	cwd: string;
	exec: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	print: PublishPrint;
	/** Waits between tries; injected so tests do not sleep. */
	sleep?: (ms: number) => Promise<void>;
	/** Wait before each retry, in ms. One entry per retry; the length is the number of retries. Defaults to 5 s then 15 s. */
	backoffMs?: readonly number[];
}
