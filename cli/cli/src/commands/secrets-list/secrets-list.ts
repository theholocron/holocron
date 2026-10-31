/**
 * `holocron secrets list` — which secrets exist, by name, at each scope.
 *
 * Read-only: GitHub never returns a value, so only names are printed. A scope
 * that cannot be listed (a token without the scope, a missing environment) is
 * reported under its heading and counted, and the other scopes are still
 * listed; the command exits non-zero when any failed.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Secrets, type SecretScope } from "../../plugin/index.js";
import type { RunSecretsListInput, SecretsListGroup, SecretsListReport } from "./secrets-list.type.js";

export async function runSecretsList(input: RunSecretsListInput): Promise<SecretsListReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "secrets list");

	if (!loader.has("secrets")) {
		throw new Error("`secrets` capability is not configured — add a `secrets` provider to holocron.config.json");
	}
	const secrets = loader.get("secrets") as Secrets;

	const groups: SecretsListGroup[] = [];
	for (const scope of input.scopes) {
		const label = describeScope(scope);
		try {
			const names = [...(await secrets.listSecrets(scope))].sort();
			groups.push({ scope, label, names });
			logger.info(
				{ scope: label, count: names.length, provider: secrets.providerName },
				`secrets list: ${label}`
			);
		} catch (err) {
			const error = errorMessage(err);
			groups.push({ scope, label, names: [], error });
			logger.warn({ scope: label, reason: error }, `secrets list: ${label}`);
		}
	}
	const report: SecretsListReport = { groups, failed: groups.filter((g) => g.error !== undefined).length };

	if (input.json) {
		print(
			JSON.stringify(
				groups.map(({ label: _label, ...group }) => group),
				null,
				2
			)
		);
	} else {
		printGroups(groups, print);
	}
	return report;
}

// ── helpers ──────────────────────────────────────────────────────────

function printGroups(groups: SecretsListGroup[], print: (line: string) => void): void {
	for (const [index, group] of groups.entries()) {
		if (index > 0) print("");
		print(group.label);
		if (group.error !== undefined) print(`  ✗ ${group.error}`);
		else if (group.names.length === 0) print("  (none)");
		else for (const name of group.names) print(`  ${name}`);
	}
}

function describeScope(scope: SecretScope): string {
	if (scope.kind === "repo") return "repo";
	return `${scope.kind} ${scope.name}`;
}
