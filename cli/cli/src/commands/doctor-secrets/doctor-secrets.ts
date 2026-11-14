/**
 * `holocron doctor secrets` — do the secrets the config says must exist, exist?
 *
 * Read-only, names only: GitHub never returns a value. One row for the repository's secrets, one for the
 * organization's and one per environment, each only when the config expects something there (see
 * {@link expectedSecrets}). A secret that exists but is not expected is never a problem. A scope that cannot be
 * read because there is no provider, or no token for it, is a skip with the reason, not a failure.
 *
 * `input.environments` (`--env`) limits the run: `ci` is the GitHub side (`repo.secrets.sync` and the declared
 * names), `prod` the `repo.secrets.deploy` destinations; `local`, `dev` and `test` are skipped rows that say why.
 */

import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Vault } from "../../plugin/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { ciRows } from "./ci-rows.js";
import { deployKeyRows } from "./deploy-key-rows.js";
import type { DoctorEnvironment, DoctorSecretsReport, RunDoctorSecretsInput } from "./doctor-secrets.type.js";
import { environmentSkipRow } from "./environment-skip-row.js";

export async function runDoctorSecrets(input: RunDoctorSecretsInput): Promise<DoctorSecretsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	// `ci` (GitHub, from `repo.secrets.sync`) and `prod` (the `repo.secrets.deploy` destinations) have rows of their own;
	// the others are a skipped row that says why. With no `--env`, the two that have rows run and nothing else is listed.
	const only = input.environments;
	const wants = (env: DoctorEnvironment) => only === undefined || only.includes(env);
	const skipRow = (env: DoctorEnvironment): CheckRow[] => {
		const row = only?.includes(env) ? environmentSkipRow(env) : undefined;
		return row ? [row] : [];
	};

	const rows: CheckRow[] = [...skipRow("local"), ...skipRow("dev")];
	if (wants("ci") || wants("prod")) {
		const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
		await loader.load();
		assertPluginsResolvable(loader, "doctor secrets");
		const vault: Vault | { why: string } = loader.has("vault")
			? (loader.get("vault") as Vault)
			: { why: whyMissing(loader, "vault", "no `vault` provider to list the environment's keys with") };

		const org = input.context.org ?? (input.context.repo ?? input.loaded.resolved.repo?.name ?? "").split("/")[0];
		const ci = wants("ci")
			? await ciRows(loader, input.loaded.resolved, vault, org)
			: { declared: false, rows: [] };
		// What `repo.secrets.deploy` lets a deployment or Worker receive: names only, shown before a sync (#2061).
		const deployRows = wants("prod")
			? await deployKeyRows(input.loaded.resolved.repo?.secrets?.deploy ?? [], vault)
			: [];
		if (!ci.declared && deployRows.length === 0) {
			rows.push({ id: "secrets", title: "secrets", status: "ok", detail: "none declared", problems: [] });
		}
		rows.push(...ci.rows, ...skipRow("test"), ...deployRows);
	} else {
		rows.push(...skipRow("test"));
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor secrets");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}
