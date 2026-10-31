import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";
import { DEEP_CHECKS } from "../deep-checks/index.js";

export interface DoctorArgs extends GlobalArgs {
	repo?: string;
}

export const doctorArgs = (y: Argv<GlobalArgs>): Argv<DoctorArgs> => {
	const withRepo = y.option("repo", {
		type: "string",
		describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
	});
	return DEEP_CHECKS.reduce(
		(acc, check) => acc.command(check.command as never),
		withRepo
	) as unknown as Argv<DoctorArgs>;
};
