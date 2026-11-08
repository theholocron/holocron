import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorLogsEntry: MenuEntry = {
	name: "doctor logs",
	description: "Check the Axiom datasets the setup ships logs to exist and the token reaches them (read-only)",
	positionals: [],
	supportsDryRun: false,
};
