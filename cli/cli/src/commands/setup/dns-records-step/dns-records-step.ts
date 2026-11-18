import { errorMessage } from "@theholocron/misc-utils";

import { type DnsRecordsIo, readDnsRecords } from "../../../dns-records/index.js";
import type { PluginLoader } from "../../../plugin/index.js";
import { describeProviderError } from "../describe-provider-error/index.js";
import type { SetupStepResult } from "../run-step/index.js";

/**
 * `holocron setup`'s step for the records `holocron new domain` keeps in `.holocron/dns-records.json` (spec
 * `tech-new-domain-command`). Each is made through the `dns` provider, DNS-only unless the entry says `proxied`; an
 * upsert leaves a record that is already right as it is. With no `dns` provider each is a failing `todo` row that says
 * what to make. `--dry-run` writes nothing. Never deletes. No list, no steps; a list that cannot be read is one
 * failing row.
 */
export async function dnsRecordsStep(
	loader: PluginLoader,
	repoRoot: string,
	dryRun: boolean,
	io?: DnsRecordsIo
): Promise<SetupStepResult[]> {
	let list;
	try {
		list = await readDnsRecords(repoRoot, io);
	} catch (err) {
		return [{ capability: "dns", step: "read dns-records.json", status: "fail", message: errorMessage(err) }];
	}
	const steps: SetupStepResult[] = [];
	for (const e of list) {
		const step = `dns ${e.type} ${e.name}`;
		if (dryRun) {
			steps.push({ capability: "dns", step, status: "dry-run", message: "would make the record" });
		} else if (!loader.has("dns")) {
			steps.push({
				capability: "dns",
				step,
				status: "fail",
				message: `todo: no \`dns\` provider is configured; make ${e.type} ${e.name} -> ${e.value}`,
			});
		} else {
			try {
				await loader.get("dns").upsertRecord(e.name, {
					type: e.type,
					name: e.name,
					content: e.value,
					proxied: e.proxied ?? false,
				});
				steps.push({
					capability: "dns",
					step,
					status: "ok",
					message: `made${e.proxied ? "" : " (DNS only)"}${e.note ? `: ${e.note}` : ""}`,
				});
			} catch (err) {
				steps.push({ capability: "dns", step, status: "fail", message: describeProviderError(err) });
			}
		}
	}
	return steps;
}
