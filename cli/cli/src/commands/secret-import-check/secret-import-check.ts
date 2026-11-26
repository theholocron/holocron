/**
 * Check that a hand-imported secret really changed in the vault (spec `tech-rotate-generated-secrets`). The Environment
 * is read in memory before the file is written and again after the wait, and only a per-run salted hash of the value is
 * kept between the two reads, so nothing here holds, prints or returns a value. A forgotten import is then caught by
 * this comparison, not by a 401 later.
 */
import { createHash, randomBytes } from "node:crypto";

import { errorMessage } from "@theholocron/misc-utils";

import type { Vault } from "../../plugin/index.js";
import type { EnvironmentRead, ImportVerdict } from "./secret-import-check.type.js";

/** A fresh salt for one run, so a fingerprint means nothing outside it. */
export function newSalt(): string {
	return randomBytes(16).toString("hex");
}

function fingerprint(salt: string, value: string): string {
	return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

/**
 * Reads `name` from the vault Environment `environmentId` and reduces it to a fingerprint. A vault with no way to read an
 * Environment, or a read that throws, is `unreadable` with the reason (never the thrown value's text beyond its message).
 */
export async function readEnvironmentSecret(
	vault: Vault | undefined,
	environmentId: string,
	name: string,
	salt: string
): Promise<EnvironmentRead> {
	if (!vault) return { status: "unreadable", why: "no vault provider is configured" };
	try {
		let value: string | undefined;
		if (vault.readEnvironmentEntries) {
			value = (await vault.readEnvironmentEntries(environmentId)).find((e) => e.name === name)?.value;
		} else if (vault.readEnvironment) {
			const values = await vault.readEnvironment(environmentId);
			value = Object.hasOwn(values, name) ? values[name] : undefined;
		} else {
			return { status: "unreadable", why: `${vault.providerName} cannot read an Environment` };
		}
		if (value === undefined) return { status: "read", fingerprint: undefined, missing: true };
		return { status: "read", fingerprint: value === "" ? undefined : fingerprint(salt, value), missing: false };
	} catch (err) {
		return { status: "unreadable", why: errorMessage(err) };
	}
}

/** Whether the Environment holds a new, non-blank value after the import, from the reads before and after it. */
export function judgeImport(
	name: string,
	environment: string,
	before: EnvironmentRead,
	after: EnvironmentRead
): ImportVerdict {
	if (after.status === "unreadable") {
		return { status: "skip", message: `could not read ${environment} to check the import: ${after.why}` };
	}
	if (after.missing) return { status: "fail", message: `${environment} has no ${name}: it was not imported` };
	if (after.fingerprint === undefined) return { status: "fail", message: `${environment} holds a blank ${name}` };
	if (before.status === "read" && before.fingerprint === after.fingerprint) {
		return { status: "fail", message: `${environment} still holds the old value of ${name}: it was not imported` };
	}
	if (before.status === "unreadable") {
		return {
			status: "ok",
			message: `${environment} holds ${name} (the old value could not be read, so a change is not proved)`,
		};
	}
	return { status: "ok", message: `${environment} holds a new ${name}` };
}
