// @ts-ignore
import Conf, { type Schema } from "conf";
import pkg from "@/package";

import { preferences, type PreferencesSchema } from "./preferences.conf";

interface ConfigSchema {
	name: string;
	preferences: PreferencesSchema;
}

const schema: Schema<ConfigSchema> = {
	name: {
		default: "cli-template",
		type: "string",
	},
	preferences: {
		type: "object",
		properties: preferences,
	},
};

export const config = new Conf({
	projectName: pkg.name,
	projectVersion: pkg.version,
	schema,
});
