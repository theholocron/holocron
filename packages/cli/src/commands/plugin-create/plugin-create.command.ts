import { input, select } from "@inquirer/prompts";
import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { CARDINALITY } from "../../plugin/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { PluginCreateError, resolvePluginCreateInputs, runPluginCreate } from "./index.js";
import { type PluginCreateArgs, pluginCreateArgs } from "./plugin-create.args.js";

export const pluginCreateCommand: CommandModule<GlobalArgs, PluginCreateArgs> = {
	command: "plugin [slug] [vendor]",
	describe: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
	builder: pluginCreateArgs,
	handler: async (argv) => {
		try {
			const [slug, vendor] = await promptForPositionals(getEntry("new plugin"), argv as Record<string, unknown>);
			const { capability, vendorEnv, baseUrl } = await resolvePluginCreateInputs(
				{
					capability: argv.capability as string | undefined,
					vendorEnv: argv.vendorEnv as string | undefined,
					baseUrl: argv.baseUrl as string | undefined,
				},
				{
					selectCapability: () =>
						select({
							message: "Capability:",
							choices: Object.keys(CARDINALITY).map((k) => ({ name: k, value: k })),
						}),
					inputVendorEnv: () =>
						input({
							message: `Vendor-native env var for the ${vendor} token (e.g. MYVENDOR_API_KEY):`,
						}),
					inputBaseUrl: () =>
						input({
							message: `REST base URL for the ${vendor} API (e.g. https://api.myvendor.com):`,
						}),
				}
			);

			const report = runPluginCreate({
				slug: slug!,
				vendorName: vendor!,
				capability,
				vendorEnv,
				baseUrl,
				...(argv.tokenEnv ? { tokenEnv: argv.tokenEnv as string } : {}),
				dryRun: argv.dryRun,
				// Yargs: `--no-verify` flips `argv.verify` to false. We pass
				// the inverse to preserve the internal `noVerify` naming.
				noVerify: !argv.verify,
				cwd: argv.cwd,
			});
			if (report.status === "fail") process.exitCode = 1;
		} catch (err) {
			if (err instanceof PluginCreateError) {
				reportError(`plugin create: ${err.message}`);
				process.exitCode = 1;
				return;
			}
			throw err;
		}
	},
};
