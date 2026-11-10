import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorVariableOwnersEntry: MenuEntry = {
	name: "doctor variable-owners",
	description:
		"Flag a variable name that lives in more than one place: 1Password Environments and GitHub Actions (read-only, names only)",
	positionals: [],
	supportsDryRun: false,
};
