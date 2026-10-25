import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeGuildId } from "./write-guild-id.js";

async function fileWith(text: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "guild-id-"));
	const path = join(dir, "holocron.config.ts");
	await writeFile(path, text);
	return path;
}

describe("writeGuildId", () => {
	it("replaces the one guildId and touches nothing else, keeping its quote style", async () => {
		const path = await fileWith('const a = 1;\nguildId: "1303969001822486568", // the server\nconst b = 2;\n');
		expect(await writeGuildId(path, "9000000000000000001")).toEqual({ written: true });
		expect(await readFile(path, "utf8")).toBe(
			'const a = 1;\nguildId: "9000000000000000001", // the server\nconst b = 2;\n'
		);
		const single = await fileWith("{ guildId: '123' }");
		await writeGuildId(single, "456");
		expect(await readFile(single, "utf8")).toBe("{ guildId: '456' }");
		const json = await fileWith('{ "guildId": "123" }');
		await writeGuildId(json, "456");
		expect(await readFile(json, "utf8")).toBe('{ "guildId": "456" }');
	});

	it("leaves the file alone and says why when there is no guildId, or more than one", async () => {
		const none = await fileWith("export default {};\n");
		const noneResult = await writeGuildId(none, "456");
		expect(noneResult).toMatchObject({ written: false });
		expect(await readFile(none, "utf8")).toBe("export default {};\n");
		const two = await fileWith('guildId: "1"\nguildId: "2"\n');
		expect(await writeGuildId(two, "456")).toMatchObject({
			written: false,
			reason: expect.stringContaining("more than one"),
		});
		expect(await readFile(two, "utf8")).toBe('guildId: "1"\nguildId: "2"\n');
	});

	it("refuses an id that is not digits, and a file it cannot read", async () => {
		const path = await fileWith('guildId: "1"');
		expect(await writeGuildId(path, "not-an-id")).toMatchObject({ written: false });
		expect(await readFile(path, "utf8")).toBe('guildId: "1"');
		expect(await writeGuildId("/nonexistent/holocron.config.ts", "456")).toMatchObject({
			written: false,
			reason: expect.stringContaining("could not read"),
		});
	});
});
