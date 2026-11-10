/**
 * `holocron doctor variable-owners` — does a variable live in more than one place?
 *
 * Read-only, and names only: no value is read, printed, logged or kept. It gathers the variable names of every
 * 1Password Environment the config names (through `Credentials.inspect`) and of the GitHub Actions secrets and variables
 * (through the `secrets` and `source` providers), then reports a name that two places hold, one row per name (`fail`).
 * Not reported: the copy a `repo.secrets.sync` or `repo.variables.sync` entry makes (the one allowed path), a name
 * listed in `doctor.sharedVariables` (deliberate sharing), and the same name in the instances of one GitHub App
 * (`githubApps`). A bare name next to its prefixed spelling (`X` and `HOLOCRON_X`) is an `info` row, shown as skipped,
 * because the fallback is deliberate during a rename. A place that cannot be read is a skip with the reason.
 */

import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Credentials,
	PluginLoader,
	type Secrets,
	type Source,
} from "../../plugin/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import type { DoctorVariableOwnersReport, RunDoctorVariableOwnersInput } from "./doctor-variable-owners.type.js";
import { findDuplicates } from "./find-duplicates.js";
import { findPrefixedPairs } from "./find-prefixed-pairs.js";
import { githubEnvironments } from "./github-environments.js";
import { ownerEnvironments } from "./owner-environments.js";
import { readEnvironments } from "./read-environments.js";
import { readGitHub } from "./read-github.js";
import { syncFeeds } from "./sync-feeds.js";

export async function runDoctorVariableOwners(
	input: RunDoctorVariableOwnersInput
): Promise<DoctorVariableOwnersReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader =
		input.loader ?? new PluginLoader(input.loaded.resolved, input.context, undefined, { readCredentials: false });
	await loader.load();
	assertPluginsResolvable(loader, "doctor variable-owners");

	const config = input.loaded.resolved;
	const feeds = syncFeeds(config);
	const { names, instances } = ownerEnvironments(config);
	const org = input.context.org ?? (input.context.repo ?? config.repo?.name ?? "").split("/")[0];

	const failedToLoad = loader
		.loadFailures()
		.filter((f) => f.key === "credentials")
		.map((f) => f.provider);
	const environments = await readEnvironments(
		names,
		instances,
		loader.has("credentials") ? (loader.get("credentials") as Credentials[]) : [],
		failedToLoad.length > 0
			? `a \`credentials\` provider failed to load (${failedToLoad.join(", ")})`
			: "no `credentials` provider is configured"
	);
	const github = await readGitHub({
		secrets: loader.has("secrets")
			? (loader.get("secrets") as Secrets)
			: { why: whyMissing(loader, "secrets", "no `secrets` provider to read the secret names with") },
		source: loader.has("source")
			? (loader.get("source") as Source)
			: { why: whyMissing(loader, "source", "no `source` provider to read the variable names with") },
		org: org || undefined,
		environments: githubEnvironments(config, feeds),
	});

	const sources = [...environments.sources, ...github.sources];
	const rows: CheckRow[] = [...environments.rows, ...github.rows];

	const duplicates = findDuplicates(sources, feeds, config.doctor.sharedVariables ?? []);
	for (const { name, places } of duplicates) {
		rows.push({
			id: `owners:${name}`,
			title: name,
			status: "fail",
			detail: `lives in ${places.length} places`,
			problems: places.map((place) => `held by ${place.label}`),
		});
	}
	for (const { bare, prefixed } of findPrefixedPairs(sources)) {
		rows.push({
			id: `pair:${bare.name}`,
			title: `${bare.name} and ${prefixed.name}`,
			status: "skip",
			detail: `info: both exist (${bare.name} in ${bare.places.map((p) => p.label).join(", ")}; ${prefixed.name} in ${prefixed.places.map((p) => p.label).join(", ")}). Fine during a rename; a leftover after it`,
			problems: [],
		});
	}
	if (duplicates.length === 0 && sources.length > 0) {
		const distinct = new Set(sources.flatMap((s) => s.names.map((n) => n.toUpperCase())));
		rows.push({
			id: "owners",
			title: "no variable lives in more than one place",
			status: "ok",
			detail: `${distinct.size} name(s) across ${sources.length} place(s) read`,
			problems: [],
		});
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor variable-owners");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}
