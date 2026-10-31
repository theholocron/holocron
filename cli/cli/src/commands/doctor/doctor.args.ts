import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";
import { DEEP_CHECKS } from "../deep-checks/index.js";

export interface DoctorArgs extends GlobalArgs {
	repo?: string;
	/** Run every deep check instead of the smoke check. */
	all?: boolean;
}

export const doctorArgs = (y: Argv<GlobalArgs>): Argv<DoctorArgs> => {
	const withRepo = y
		.option("all", {
			type: "boolean",
			default: false,
			describe: "Run every deep check (doctor <capability>) and print one row each, instead of the smoke check",
		})
		.option("repo", {
			type: "string",
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		});
	return DEEP_CHECKS.reduce(
		(acc, check) => acc.command(check.command as never),
		withRepo
	) as unknown as Argv<DoctorArgs>;
};
