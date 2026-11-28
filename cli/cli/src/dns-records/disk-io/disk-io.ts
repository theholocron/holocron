import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { DnsRecordsIo } from "../dns-records.type.js";

/** The file system the list lives on. */
export const diskIo: DnsRecordsIo = {
	read: (path) =>
		readFile(path, "utf8").catch((err: NodeJS.ErrnoException) => {
			if (err.code === "ENOENT") return null;
			throw err;
		}),
	write: async (path, text) => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, text, "utf8");
	},
};
