import { describe, expect, it, vi } from "vitest";

import { MAX_CONFIG_DIR_FILE_BYTES, MAX_CONFIG_DIR_FILES } from "./fetch-config-dir.constants.js";
import { fetchConfigDir } from "./fetch-config-dir.js";
import type { FetchConfigDirInput } from "./fetch-config-dir.type.js";

interface Entry {
	path: string;
	size: number;
	type: string;
}

const makeClient = (entries: Entry[]) => {
	const getContents = vi.fn(async (_repo: string, path: string) => ({
		content: Buffer.from(`// ${path}`).toString("base64"),
	}));
	const listDirectory = vi.fn(async () => entries);
	const client = { git: { listDirectory, getContents } } as unknown as FetchConfigDirInput["client"];
	return { client, getContents };
};

const file = (path: string, size = 10): Entry => ({ path: `.holocron/${path}`, size, type: "file" });
const input = (client: FetchConfigDirInput["client"]): FetchConfigDirInput => ({
	client,
	repo: "acme/demo",
	dir: ".holocron",
	ref: "feat",
});

describe("fetchConfigDir", () => {
	it("skips a 380 KB picture before any cap and never requests it", async () => {
		const { client, getContents } = makeClient([
			file("notifications.ts"),
			file("media/webhook-avatar.png", 380 * 1024),
			file("media/logo.SVG", 380 * 1024),
		]);

		const result = await fetchConfigDir(input(client));

		expect(result.map((f) => f.path)).toEqual([".holocron/notifications.ts"]);
		expect(getContents).toHaveBeenCalledTimes(1);
	});

	it("does not count pictures toward the file cap", async () => {
		const pics = Array.from({ length: MAX_CONFIG_DIR_FILES + 5 }, (_, i) => file(`media/${i}.png`));
		const { client } = makeClient([file("repo.ts"), ...pics]);

		await expect(fetchConfigDir(input(client))).resolves.toHaveLength(1);
	});

	it("still rejects a config file over the per-file cap", async () => {
		const { client } = makeClient([file("big.ts", MAX_CONFIG_DIR_FILE_BYTES + 1)]);

		await expect(fetchConfigDir(input(client))).rejects.toThrow(".holocron/big.ts is larger than 100 KB");
	});

	it("still rejects too many config files", async () => {
		const many = Array.from({ length: MAX_CONFIG_DIR_FILES + 1 }, (_, i) => file(`a${i}.ts`));
		const { client } = makeClient(many);

		await expect(fetchConfigDir(input(client))).rejects.toThrow("the limit is 50");
	});
});
