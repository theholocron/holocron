import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "./config/index.js";
import { ConfigFileError, loadConfig } from "./config-system.js";

const layout = { relay: { host: "relay.example.dev" } };

describe("loadConfig with .holocron/ area files", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "holocron-areas-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const config = (extra: Record<string, unknown> = {}) =>
		writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "demo", providers: { source: "github" }, ...extra })
		);
	const area = async (file: string, content: string) => {
		await mkdir(join(cwd, ".holocron"), { recursive: true });
		await writeFile(join(cwd, ".holocron", file), content);
	};
	const notificationsOf = async () => (await loadConfig(cwd)).resolved.providers.notifications;

	it("loads the notifications layout from .holocron/notifications.ts", async () => {
		await config({ providers: { source: "github", notifications: ["discord", { guildId: "1" }] } });
		await area("notifications.ts", `export default ${JSON.stringify(layout)};`);
		expect(await notificationsOf()).toMatchObject({ tuples: [{ options: { guildId: "1", layout } }] });
	});

	it("loads the notifications layout from .holocron/notifications.json", async () => {
		await config({ providers: { source: "github", notifications: ["discord", { guildId: "1" }] } });
		await area("notifications.json", JSON.stringify(layout));
		expect(await notificationsOf()).toMatchObject({ tuples: [{ options: { guildId: "1", layout } }] });
	});

	it("gives a bare provider name the layout", async () => {
		await config({ providers: { source: "github", notifications: "discord" } });
		await area("notifications.json", JSON.stringify(layout));
		expect(await notificationsOf()).toMatchObject({ tuples: [{ options: { layout } }] });
	});

	it("errors naming both when the layout is set inline and in a file", async () => {
		await config({ providers: { source: "github", notifications: ["discord", { layout: {} }] } });
		await area("notifications.json", JSON.stringify(layout));
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/providers\.notifications and in \.holocron\/notifications\.json/);
	});

	it("errors when the file has a layout but no notifications provider is set", async () => {
		await config();
		await area("notifications.json", JSON.stringify(layout));
		await expect(loadConfig(cwd)).rejects.toThrow(/providers\.notifications is not set/);
	});

	it("merges .holocron/repo.* under the inline repo keys", async () => {
		await config({ repo: { defaultBranch: "alpha" } });
		await area("repo.json", JSON.stringify({ topics: ["a", "b"] }));
		const { resolved } = await loadConfig(cwd);
		expect(resolved.repo).toMatchObject({ defaultBranch: "alpha", topics: ["a", "b"] });
	});

	it("errors naming both when a repo key is set inline and in a file", async () => {
		await config({ repo: { topics: ["x"] } });
		await area("repo.json", JSON.stringify({ topics: ["a"] }));
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/repo\.topics is set in the config and in \.holocron\/repo\.json/);
	});

	it("errors when an area file does not export an object", async () => {
		await config({ repo: {} });
		await area("repo.json", "[]");
		await expect(loadConfig(cwd)).rejects.toThrow(/must export the repo settings as an object/);
	});

	it("errors with ConfigFileError when an area file fails to load", async () => {
		await config({ providers: { source: "github", notifications: "discord" } });
		await area("notifications.ts", `throw new Error("boom");`);
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as Error).message).toMatch(/notifications\.ts/);
	});

	it("loads the same config as before when .holocron/ is missing, or holds only files that are not areas", async () => {
		await config({ repo: { topics: ["x"] } });
		const before = await loadConfig(cwd);
		await area("stray.ts", `throw new Error("must not run");`);
		expect((await loadConfig(cwd)).resolved).toEqual(before.resolved);
	});
});
