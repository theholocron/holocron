import { confirm, input as promptInput, select } from "@inquirer/prompts";
import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { DNS_ENTRY_TYPES } from "../../dns-records/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { PluginLoader } from "../../plugin/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runNewDomain } from "./new-domain.js";
import type { NewDomainField } from "./new-domain.type.js";

const newDomainArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("type", {
			type: "string",
			describe: `Record type: ${DNS_ENTRY_TYPES.join(", ")} (asked for on a terminal)`,
		})
		.option("name", {
			type: "string",
			describe: "The full hostname, under the org's domain (asked for on a terminal)",
		})
		.option("value", {
			type: "string",
			describe: "The record's content, as the vendor shows it (asked for on a terminal)",
		})
		.option("note", { type: "string", describe: "Why it exists, e.g. which vendor serves the name" })
		.option("proxied", {
			type: "boolean",
			default: false,
			describe:
				"Send traffic through the provider's proxy (default: DNS only, which a vendor's verification needs)",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Make the record without asking first (required without a terminal)",
		});

type NewDomainArgs = InferArgs<typeof newDomainArgs>;

/** Ask for one field on a terminal. */
async function ask(field: NewDomainField): Promise<string> {
	if (field === "type") {
		return select({ message: "Record type:", choices: DNS_ENTRY_TYPES.map((t) => ({ value: t })) });
	}
	return promptInput({ message: field === "name" ? "Hostname:" : "Value, as the vendor shows it:" });
}

export const newDomainCommand: CommandModule<GlobalArgs, NewDomainArgs> = {
	command: "domain",
	describe: "Make a DNS record through the `dns` provider and keep it in .holocron/dns-records.json",
	builder: newDomainArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const terminal = process.stdin.isTTY === true;
		const context = { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) };
		const report = await runNewDomain({
			loaded,
			context,
			loader: new PluginLoader(loaded.resolved, context),
			print: (line) => console.log(line),
			logger: getLogger(),
			...(argv.type ? { type: argv.type } : {}),
			...(argv.name ? { name: argv.name } : {}),
			...(argv.value ? { value: argv.value } : {}),
			...(argv.note ? { note: argv.note } : {}),
			...(argv.proxied ? { proxied: true } : {}),
			...(argv.yes ? { yes: true } : {}),
			...(terminal ? { ask, confirm: (message: string) => confirm({ message, default: false }) } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
