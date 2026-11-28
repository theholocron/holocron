import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorErrorsEntry: MenuEntry = {
	name: "doctor errors",
	description: "Check the error tracker's organization, declared projects, keys and alert rules (read-only)",
	positionals: [],
	skipOptions: ["all", "repo"],
	supportsDryRun: false,
};
