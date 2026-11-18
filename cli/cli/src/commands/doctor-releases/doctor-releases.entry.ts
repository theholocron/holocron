import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorReleasesEntry: MenuEntry = {
	name: "doctor releases",
	description:
		"Check that npm received every release tag, and name the tag and note to delete when it did not (read-only)",
	positionals: [],
	skipOptions: ["all", "repo"],
	supportsDryRun: false,
};
