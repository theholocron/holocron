/**
 * The `--shared` side of `holocron doctor secrets`: does a secret hold the same value in two layers?
 *
 * A leak from CI should not expose what a laptop holds, so the layers (`<org/repo> - local|dev|ci|prod`) keep their
 * own values (#2058, #2059). Read-only: it reads each layer's Environment in memory through the `vault` provider and
 * compares the concealed entries by a salted hash made fresh for the run. It prints names only, one row per pair of
 * layers; no value, hash or length reaches the output, a log or an error. A shared secret is an `info` row (shown as
 * skipped) and the exit stays 0, unless `--strict` makes it a failure. A name in `doctor.sharedVariables` or passed
 * with `--allow` is shared on purpose and left out. A layer that cannot be read is a skipped row; `local` missing is silent.
 */

import type { GitExec } from "@theholocron/git-utils";
import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import { type EnvironmentLayer, repoSlug } from "../../credentials-environments/index.js";
import type { Vault } from "../../plugin/index.js";
import { compareLayers } from "./compare-layers.js";
import { compareVariables } from "./compare-variables.js";
import type { RunDoctorSecretsInput } from "./doctor-secrets.type.js";
import { readLayers } from "./read-layers.js";

function skipRow(id: string, title: string, detail: string): CheckRow {
	return { id: `shared:${id}`, title, status: "skip", detail, problems: [] };
}

/** What `sharedRows()` needs. */
export interface SharedRowsInput {
	/** The loaded config: `doctor.sharedVariables`. */
	loaded: RunDoctorSecretsInput["loaded"];
	/** The runtime context; `repoRoot` is where the `origin` remote is read. */
	context: RunDoctorSecretsInput["context"];
	/** The `vault` provider, or why there is none. */
	vault: Vault | { why: string };
	/** Runs the version-control command for the `origin` remote. Defaults to the real one; a test passes a fake. */
	gitExec?: GitExec;
	/** The layers to compare, in `local, dev, ci, prod` order. */
	layers: readonly EnvironmentLayer[];
	/** A secret shared between two layers is a failure, not an `info` row. */
	strict: boolean;
	/** Names shared on purpose, besides `doctor.sharedVariables` (`--allow`). */
	allow: readonly string[];
}

/** What `sharedRows()` gives back. */
export interface SharedRowsResult {
	/** The rows to show. */
	rows: CheckRow[];
	/** One line of counts to print after the rows, names and numbers only. */
	note: string;
}

/**
 * Compares the secrets of the named layers by a per-run salted hash, in memory.
 *
 * @param input - The config, the vault and what to compare.
 * @returns The rows and the closing line of counts. Never throws for a layer that cannot be read: that is a skipped row.
 */
export async function sharedRows(input: SharedRowsInput): Promise<SharedRowsResult> {
	const rows: CheckRow[] = [];
	let compared = 0;
	let shared = 0;
	let drifted = 0;
	const { vault } = input;
	if ("why" in vault || (!vault.readEnvironment && !vault.readEnvironmentEntries)) {
		rows.push(
			skipRow(
				"vault",
				"read the layers",
				"why" in vault ? vault.why : `${vault.providerName} cannot read an environment's variables`
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
			const read = await readLayers(vault, slug, input.layers);
			rows.push(...read.rows);
			const allow = [...(input.loaded.resolved.doctor.sharedVariables ?? []), ...input.allow];
			for (const pair of compareLayers(read.layers, allow)) {
				compared++;
				shared += pair.names.length;
				const title = `${pair.layer} = ${pair.other}`;
				if (pair.names.length === 0) {
					rows.push({
						id: `shared:pair:${pair.layer}:${pair.other}`,
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
					id: `shared:pair:${pair.layer}:${pair.other}`,
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
					id: `shared:variables:${what.split(" ")[0]}`,
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
	return {
		rows,
		note: `${compared} pair${compared === 1 ? "" : "s"} compared, ${shared} shared name${shared === 1 ? "" : "s"}, ${drifted} variable${drifted === 1 ? "" : "s"} drifting`,
	};
}
