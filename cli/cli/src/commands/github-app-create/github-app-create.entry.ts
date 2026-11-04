import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const githubAppCreateEntry: CommandEntry = {
	name: "github-app create",
	description: "Create a GitHub App from a manifest and keep its credentials in a private file to import",
	positionals: [],
	options: [
		{ key: "name", flag: "--name", type: "input", required: true, message: "The App's name:" },
		{ key: "webhookUrl", flag: "--webhook-url", type: "input", required: true, message: "Webhook URL (https):" },
		{ key: "manifest", flag: "--manifest", type: "input", required: true, message: "Manifest file:" },
	],
	skipOptions: ["webhook-secret-var", "file", "keep", "force"],
	supportsDryRun: false,
};
