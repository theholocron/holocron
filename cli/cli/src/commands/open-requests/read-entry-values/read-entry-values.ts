import { ENVIRONMENT_LAYERS, isEnvironmentLayer } from "../../../credentials-environments/index.js";
import type { Vault } from "../../../plugin/index.js";
import { resolveEnvironmentId } from "../../secrets-sync/resolve-environment-id/index.js";
import type { ReadEntryValuesInput, ReadEntryValuesResult } from "./read-entry-values.type.js";

/**
 * The values of the named entries of one vault Environment, read in memory. Only an Environment this repo uses is read:
 * a layer word (`local`, `dev`, `ci`, `prod`) is this repo's `<org/repo> - <layer>`, and any other text must be a name
 * the config already names, as `probe --environment` requires. `local` reads the way the CLI does, `- local` over
 * `- dev`, and `- local` may be absent.
 *
 * This is the one place a concealed value is read on purpose (see `AGENTS.md`, "Concealed values"): only the names the
 * collection's references list are taken, every other entry is dropped before this returns, and a value is never
 * logged or put in an error. A name the Environment lacks, or holds blank, is in `missing`.
 *
 * @throws {Error} When the Environment is not one of this repo's or the vault cannot read entries.
 */
export async function readEntryValues(input: ReadEntryValuesInput): Promise<ReadEntryValuesResult> {
	if (!isEnvironmentLayer(input.environment) && !input.configured.includes(input.environment)) {
		const known = [...ENVIRONMENT_LAYERS, ...input.configured];
		throw new Error(
			`${input.environment} is not an Environment this repo's config names; use one of: ${known.join(", ")}`
		);
	}
	const read = (id: string) =>
		(input.vault as Required<Pick<Vault, "readEnvironmentEntries">>).readEnvironmentEntries(id);
	const at = { repoRoot: input.repoRoot, gitExec: input.gitExec };
	const environmentId = await resolveEnvironmentId(input.environment, at);
	let entries;
	if (input.environment === "local") {
		// The CLI reads `- local` over `- dev`; only `- local` may be missing.
		const dev = await read(await resolveEnvironmentId("dev", at));
		const local = await read(environmentId).catch(() => []);
		entries = [...dev, ...local];
	} else {
		entries = await read(environmentId);
	}
	const held = new Map(entries.map((entry) => [entry.name, entry.value]));
	const values = new Map<string, string>();
	const missing: string[] = [];
	for (const name of input.names) {
		const value = held.get(name);
		if (value) values.set(name, value);
		else missing.push(name);
	}
	return { environmentId, values, missing };
}
