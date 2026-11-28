import type { CheckRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import { ENVIRONMENT_LAYERS, type EnvironmentLayer, layerEnvironment } from "../../credentials-environments/index.js";
import type { EnvironmentEntry, Vault } from "../../plugin/index.js";
import type { LayerReads, LayerSecrets } from "./doctor-secrets.type.js";

/** An error's text with every value read so far taken out, so a vault's message can never carry one to the output. */
function scrubbed(err: unknown, known: string[]): string {
	return known.reduce((text, value) => text.split(value).join("[redacted]"), describeError(err));
}

/**
 * Reads each layer's Environment (`<slug> - local|dev|ci|prod`) in memory, every entry with its `concealed` flag.
 *
 * A provider that implements `readEnvironmentEntries` says which entries are concealed. One
 * that only has `readEnvironment` cannot say, so every entry is kept and one skipped row says so: the allow-list is
 * then the way to leave a visible value out. A layer that cannot be read is a skipped row naming it and why; `local`
 * is optional, so an unreadable one is silent. Nothing read here is printed or logged.
 *
 * @param vault - A `vault` provider that can read an environment.
 * @param slug - The `<org>/<repo>` the Environments are named from.
 */
export async function readLayers(
	vault: Vault,
	slug: string,
	layers: readonly EnvironmentLayer[] = ENVIRONMENT_LAYERS
): Promise<LayerReads> {
	const read: LayerSecrets[] = [];
	const rows: CheckRow[] = [];
	const known: string[] = [];
	let blind = false;
	for (const layer of layers) {
		const environment = layerEnvironment(slug, layer);
		let entries: EnvironmentEntry[];
		try {
			if (vault.readEnvironmentEntries) {
				entries = await vault.readEnvironmentEntries(environment);
			} else {
				const values = await vault.readEnvironment!(environment);
				entries = Object.entries(values).map(([name, value]) => ({ name, value, concealed: true }));
				blind = true;
			}
		} catch (err) {
			if (layer === "local") continue;
			rows.push({
				id: `skip:${layer}`,
				title: `Environment "${environment}"`,
				status: "skip",
				detail: `could not read it: ${scrubbed(err, known)}`,
				problems: [],
			});
			continue;
		}
		known.push(...entries.map((e) => e.value).filter(Boolean));
		read.push({ layer, environment, entries });
	}
	if (blind) {
		rows.unshift({
			id: "concealed",
			title: `${vault.providerName} cannot say which entries are concealed`,
			status: "skip",
			detail: "info: every entry is compared; list a visible value that is meant to be shared in `doctor.sharedVariables`",
			problems: [],
		});
	}
	return { layers: read, rows };
}
