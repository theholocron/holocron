import fs from "node:fs";
import dotenv from "dotenv";

const ENV_CONF = `${process.cwd()}/.env`;

/**
 * Reads environment variables from the .env file.
 */
type ReadEnvReturn<T> = [Error | null, T];

const readEnv = <T = Record<string, string>>(key?: string): ReadEnvReturn<T> => {
	try {
		const result = dotenv.config();

		if (result.error) {
			return [result.error, {} as T];
		}

		const parsedData = result.parsed || {};

		if (key && parsedData.hasOwnProperty(key)) {
			return [null, parsedData[key] as T];
		}

		return [null, parsedData as T];
	} catch (error) {
		return [error as Error, {} as T];
	}
};

/**
 * Writes environment variables to the .env file.
 */
const writeEnv = (obj: Record<string, string>): [Error | null, boolean] => {
	try {
		const [_, conf] = readEnv();

		const newConf = {
			...conf,
			...obj,
		};

		const content = Object.entries(newConf)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		fs.writeFileSync(ENV_CONF, content, { flag: "w+" });
		return [null, true];
	} catch (err) {
		return [err as Error, false];
	}
};

export const env = {
	read: readEnv,
	write: writeEnv,
};
