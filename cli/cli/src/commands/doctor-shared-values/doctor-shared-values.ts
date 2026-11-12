/**
 * `holocron doctor shared-values` — does a secret hold the same value in two layers?
 *
 * A leak from CI should not expose what a laptop holds, so the layers (`<org/repo> - local|dev|ci|prod`) keep their
 * own values (#2058, #2059). Read-only: it reads each layer's Environment in memory through the `vault` provider and
 * compares the concealed entries by a salted hash made fresh for the run. It prints names only, one row per pair of
 * layers; no value, hash or length reaches the output, a log or an error. A shared secret is an `info` row (shown as
 * skipped) and the exit stays 0, unless `--strict` makes it a failure. A name in `doctor.sharedVariables` or passed
 * with `--allow` is shared on purpose and left out. A layer that cannot be read is a skipped row; `local` missing is silent.
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { repoSlug } from "../../credentials-environments/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Vault } from "../../plugin/index.js";
import { compareLayers } from "./compare-layers.js";
import { compareVariables } from "./compare-variables.js";
import type { DoctorSharedValuesReport, RunDoctorSharedValuesInput } from "./doctor-shared-values.type.js";
import { readLayers } from "./read-layers.js";

function skipRow(id: string, title: string, detail: string): CheckRow {
	return { id, title, status: "skip", detail, problems: [] };
}

export async function runDoctorSharedValues(input: RunDoctorSharedValuesInput): Promise<DoctorSharedValuesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor shared-values");

	const rows: CheckRow[] = [];
	let compared = 0;
	let shared = 0;
	let drifted = 0;
	const vault = loader.has("vault") ? (loader.get("vault") as Vault) : undefined;
	if (!vault?.readEnvironment && !vault?.readEnvironmentEntries) {
		rows.push(
			skipRow(
				"vault",
				"read the layers",
				vault
					? `${vault.providerName} cannot read an environment's variables`
					: "needs a `vault` provider in holocron.config.ts (1password)"
			)
		);
	} else {
		let slug: string | undefined;
		try {
			slug = await repoSlug(input.context.repoRoot, input.gitExec);
		} catch (err) {
			rows.push(skipRow("slug", "name the layers", describeError(err)));
		}
		if (slug !== undefined) {
			const read = await readLayers(vault, slug);
			rows.push(...read.rows);
			const allow = [...(input.loaded.resolved.doctor.sharedVariables ?? []), ...(input.allow ?? [])];
			for (const pair of compareLayers(read.layers, allow)) {
				compared++;
				shared += pair.names.length;
				const title = `${pair.layer} = ${pair.other}`;
				if (pair.names.length === 0) {
					rows.push({
						id: `pair:${pair.layer}:${pair.other}`,
						title,
						status: "ok",
						detail: "no secret shares a value",
						problems: [],
					});
					continue;
				}
				const count =
					pair.names.length === 1 ? "1 secret shares a value" : `${pair.names.length} secrets share a value`;
				const what = `${count} between ${pair.other} and ${pair.layer}: ${pair.names.join(", ")}`;
				rows.push({
					id: `pair:${pair.layer}:${pair.other}`,
					title,
					status: input.strict ? "fail" : "skip",
					detail: input.strict ? what : `info: ${what}`,
					problems: [],
				});
			}
			// Variables are not secrets: drift between `ci` and `dev` is always `info`, whatever `--strict` says.
			const drift = compareVariables(read.layers, allow);
			for (const [what, names] of [
				["missing from dev, present in ci", drift?.missing ?? []],
				["differ between ci and dev", drift?.differs ?? []],
			] as const) {
				if (names.length === 0) continue;
				drifted += names.length;
				rows.push({
					id: `variables:${what.split(" ")[0]}`,
					title: `variables ${what}`,
					status: "skip",
					detail: `info: ${names.length} variable${names.length === 1 ? "" : "s"}: ${names.join(", ")}`,
					problems: [],
				});
			}
			if (read.layers.length < 2) {
				rows.push(
					skipRow(
						"pairs",
						"compare the layers",
						"fewer than two layers could be read, so there is nothing to compare"
					)
				);
			}
		}
	}

	printCheckRows(rows, print);
	print(
		`${compared} pair${compared === 1 ? "" : "s"} compared, ${shared} shared name${shared === 1 ? "" : "s"}, ${drifted} variable${drifted === 1 ? "" : "s"} drifting`
	);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status, compared, shared }, "doctor shared-values");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}
