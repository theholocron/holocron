import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const tunnelUpEntry: CommandEntry = {
	name: "tunnel up",
	description: "Make a named tunnel with a stable public hostname that reaches a local port",
	positionals: [],
	options: [
		{ key: "name", flag: "--name", type: "input", required: true, message: "The tunnel's name:" },
		{ key: "hostname", flag: "--hostname", type: "input", required: true, message: "Public hostname:" },
		{ key: "port", flag: "--port", type: "input", message: "Local port (blank = 3000):" },
		{ key: "run", flag: "--run", type: "confirm", message: "Run the tunnel now?" },
	],
	supportsDryRun: true,
};
