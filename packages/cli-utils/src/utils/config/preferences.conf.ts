import * as path from "node:path";
import { HOME, OS } from "@/const";

export interface PreferencesSchema {
	debug: boolean;
	destination: string;
	ignoredFolders: string[];
	notifications: boolean;
	sound: boolean;
}

export const preferences = {
	debug: {
		type: "boolean",
		default: false,
	},
	destination: {
		type: "string",
		default: `${OS}/Desktop`,
	},
	ignoredFolders: {
		type: "array",
		items: {
			type: "string",
		},
		uniqueItems: true,
		default: [".DS_Store", "holocron", "coverage", "dist", "node_modules"],
	},
	logs: {
		type: "string",
		default:
			process.env.LOG_DIR ||
			(OS === "win32"
				? path.join(process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local"), "Holocron", "logs")
				: path.join(HOME, ".holocron", "logs")),
	},
	notifications: {
		type: "boolean",
		default: false,
	},
	sound: {
		type: "boolean",
		default: false,
	},
};
