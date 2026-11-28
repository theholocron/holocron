import { type MenuEntry } from "@theholocron/kyber/menu";

export const uploadCoverageEntry: MenuEntry = {
	name: "upload coverage",
	description: "Upload the repo's coverage reports, one flag per group, through the coverage provider",
	positionals: [],
	options: [
		{
			key: "uploads",
			flag: "--uploads",
			type: "input",
			required: true,
			message: 'Uploads, a JSON list of {"flag", "files"}:',
		},
	],
	skipOptions: ["allow-empty"],
	supportsDryRun: true,
};
