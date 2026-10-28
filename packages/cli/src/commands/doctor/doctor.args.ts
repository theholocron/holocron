import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";
import { doctorNotificationsCommand } from "../doctor-notifications/index.js";

export interface DoctorArgs extends GlobalArgs {
	repo?: string;
}

export const doctorArgs = (y: Argv<GlobalArgs>): Argv<DoctorArgs> =>
	y
		.option("repo", {
			type: "string",
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		})
		.command(doctorNotificationsCommand as never) as unknown as Argv<DoctorArgs>;
