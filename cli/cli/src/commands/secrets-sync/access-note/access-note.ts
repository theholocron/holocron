import type { SecretAccess } from "../../../plugin/index.js";

/** `selected [a, b]` or `all`: who can read, names only, repositories sorted. */
export function describeAccess(access: SecretAccess): string {
	return access.visibility === "selected"
		? `selected [${[...(access.repos ?? [])].sort().join(", ")}]`
		: access.visibility;
}

/**
 * What a write does to who can read one organization secret, for its row: `new, readers selected [...]` when it does not
 * exist yet, `readers unchanged (...)` when it is as declared, `readers all -> selected [...]` when GitHub will replace
 * them (every write sets visibility, so the dry run can say it first). `current` is `undefined` for a secret that is
 * not there; `known` is false when the organization's secrets could not be read, so only the new readers are named.
 * Names only: a value is never read.
 *
 * @param wanted - The readers the entry declares.
 * @param current - The readers GitHub reports now, if the secret exists.
 * @param known - Whether the organization's secrets were read.
 */
export function accessNote(wanted: SecretAccess, current: SecretAccess | undefined, known: boolean): string {
	const to = describeAccess(wanted);
	if (!known) return `readers -> ${to}`;
	if (!current) return `new, readers ${to}`;
	const from = describeAccess(current);
	return from === to ? `readers unchanged (${to})` : `readers ${from} -> ${to}`;
}
