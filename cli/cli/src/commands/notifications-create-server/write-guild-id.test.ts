import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

	it("ignores a commented-out guildId and edits the live one", async () => {
		const text = '// guildId: "111"\n/*\n * guildId: "222"\n */\nguildId: "333",\n';
		const path = await fileWith(text);
		expect(await writeGuildId(path, "456")).toEqual({ written: true });
		expect(await readFile(path, "utf8")).toBe('// guildId: "111"\n/*\n * guildId: "222"\n */\nguildId: "456",\n');
		const onlyComment = await fileWith('// guildId: "111"\nexport default {};\n');
		expect(await writeGuildId(onlyComment, "456")).toMatchObject({ written: false });
	});

	it("reports a file it can read but not write, instead of throwing", async () => {
		const path = await fileWith('guildId: "1"');
		await chmod(path, 0o444);
		expect(await writeGuildId(path, "456")).toMatchObject({
			written: false,
			reason: expect.stringContaining("could not write"),
		});
	});

	it("does not take a guildId that only appears inside a string or after other code on a line", async () => {
		const text =
			'const note = \'guildId: "111"\';\nconst x = 1; /* guildId: "222" */\nexport default { guildId: "333" };\n';
		const path = await fileWith(text);
		expect(await writeGuildId(path, "456")).toEqual({ written: true });
		expect(await readFile(path, "utf8")).toBe(text.replace('"333"', '"456"'));
		const decoys = await fileWith('const note = `guildId: "111"`;\nconst t = "guildId", u = "9";\n');
		expect(await writeGuildId(decoys, "456")).toMatchObject({ written: false });
	});
});
