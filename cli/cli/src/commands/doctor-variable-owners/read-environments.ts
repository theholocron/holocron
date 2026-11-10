import type { CheckRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import type { Credentials } from "../../plugin/index.js";
import type { NameSource } from "./doctor-variable-owners.type.js";

/** What reading the Environments gave: the names each one holds, and a skipped row for each that could not be read. */
export interface EnvironmentReads {
	sources: NameSource[];
	rows: CheckRow[];
}

/**
 * Reads the variable names of each Environment through `Credentials.inspect`, which lists names without reading a
 * value. The first provider that can find the Environment answers. An Environment no provider can read is a skipped
 * row naming why, never a failure.
 *
 * @param names - The Environments to read.
 * @param instances - The Environments that are instances of one GitHub App: they share a group.
 * @param providers - The loaded `credentials` providers.
 * @param none - Why there is no provider, used when `providers` is empty.
 */
export async function readEnvironments(
	names: string[],
	instances: Set<string>,
	providers: Credentials[],
	none: string
): Promise<EnvironmentReads> {
	const sources: NameSource[] = [];
	const rows: CheckRow[] = [];
	const skip = (name: string, detail: string) =>
		rows.push({
			id: `skip:env:${name}`,
			title: `Environment "${name}"`,
			status: "skip",
			detail,
			problems: [],
		});
	for (const name of names) {
		if (providers.length === 0) {
			skip(name, none);
			continue;
		}
		const readers = providers.filter((p) => p.inspect !== undefined);
		if (readers.length === 0) {
			skip(name, "no `credentials` provider can list names without reading values");
			continue;
		}
		let why = "";
		let found = false;
		for (const provider of readers) {
			try {
				const inspection = await provider.inspect!(name);
				sources.push({
					label: `Environment "${name}"`,
					group: instances.has(name) ? "app instances" : `env:${name}`,
					names: inspection.names,
					environment: name,
				});
				found = true;
				break;
			} catch (err) {
				why = `could not read it with ${provider.providerName}: ${describeError(err)}`;
			}
		}
		if (!found) skip(name, why);
	}
	return { sources, rows };
}
