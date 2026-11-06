import { type MenuEntry } from "@theholocron/kyber/menu";

export const tunnelUpEntry: MenuEntry = {
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
