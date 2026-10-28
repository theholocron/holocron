import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runUpgradeNode } from "./index.js";
import { type UpgradeNodeArgs, upgradeNodeArgs } from "./upgrade-node.args.js";

export const upgradeNodeCommand: CommandModule<GlobalArgs, UpgradeNodeArgs> = {
	command: "node [to]",
	describe: "Scan the repo and update every Node.js version pin to a new major",
	builder: upgradeNodeArgs,
	handler: async (argv) => {
		const [to] = await promptForPositionals(getEntry("repo upgrade node"), argv as Record<string, unknown>);
		// Read upgrade.node.extra from holocron.config.json if present.
		// We read the raw file directly rather than through loadConfig because
		// the upgrade config is not part of the plugin schema.
		let extra: string[] = [];
		try {
			const raw = readFileSync(join(argv.cwd, "holocron.config.json"), "utf8");
			const cfg = JSON.parse(raw) as { upgrade?: { node?: { extra?: unknown } } };
			const extraRaw = cfg.upgrade?.node?.extra;
			if (Array.isArray(extraRaw)) {
				extra = extraRaw as string[];
			}
		} catch {
			/* no config or no upgrade section — fine */
		}

		const report = await runUpgradeNode({
			to: Number(to),
			...(argv.from != null ? { from: argv.from as number } : {}),
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			extra,
		});
		if (report.status === "fail") {
			if (report.message) reportError(`upgrade node: ${report.message}`);
			process.exitCode = 1;
		}
	},
};
