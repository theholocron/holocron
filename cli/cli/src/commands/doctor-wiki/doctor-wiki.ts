/**
 * `holocron doctor wiki` — does the wiki the config declares exist, and is it what the sources say?
 *
 * Read-only: it never provisions, publishes or writes, sends no token, and prints names, addresses and counts only. The
 * rows (`wikiRows()`): the provider's organization and docs instance against the config, the site and its custom
 * domain answering, the navigation's pages existing on disk, the pages the navigation leaves out (an `info` row) and
 * the published page index against the navigation. Only a mismatch the files or the site prove fails; a site that
 * cannot be reached, an index that is not served, or a provider that cannot read its wiki is a skip with the reason.
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import type { DoctorWikiReport, RunDoctorWikiInput } from "./doctor-wiki.type.js";
import { wikiRows } from "./wiki-rows.js";

const skip = (detail: string): CheckRow => ({ id: "wiki", title: "wiki", status: "skip", detail, problems: [] });

export async function runDoctorWiki(input: RunDoctorWikiInput): Promise<DoctorWikiReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor wiki");

	let rows: CheckRow[];
	if (!loader.has("wiki")) {
		const failure = loader.loadFailures().find((f) => f.key === "wiki");
		rows = [
			skip(
				failure
					? `\`${failure.provider}\` failed to load: ${describeError(failure.error)}`
					: "no `wiki` provider is configured in holocron.config.ts"
			),
		];
	} else {
		const wiki = loader.get("wiki");
		if (!wiki.inspect) {
			rows = [skip(`${wiki.providerName} cannot read its wiki`)];
		} else {
			try {
				rows = wikiRows(await wiki.inspect(), wiki.providerName);
			} catch (err) {
				rows = [skip(missingTokenReason(err) ?? `could not read the wiki: ${describeError(err)}`)];
			}
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor wiki");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}
