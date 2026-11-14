import type { NotificationsLayout, ProbeRow } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { BOT_NEEDS } from "../../bot-needs.js";
import { createDiscordBotClient, permissions } from "../../rest.js";
import { tokenProbe } from "./token.js";
import type { TokenProbeContext } from "./token.type.js";

const BASE = "https://discord.test/api/v10";
const GUILD = "555";
const ok = (body: unknown) => ({ status: 200, body });
const app = ok({ id: "9", name: "Holonet" });
const me = ok({ id: "7", username: "holonet" });
const guild = ok({ id: GUILD, name: "The Holocron", owner_id: "1" });
const member = ok({ roles: ["r1"] });
const rolesOf = (...held: Array<{ id: string; permissions: string }>) => ok([{ id: GUILD, permissions: "0" }, ...held]);
const everything = rolesOf({ id: "r1", permissions: permissions([...BOT_NEEDS]) });
const missing = (...names: Array<(typeof BOT_NEEDS)[number]>) =>
	permissions(BOT_NEEDS.filter((n) => !names.includes(n)));

async function check(
	responses: Parameters<typeof stubFetch>[0],
	over: Partial<TokenProbeContext> & { args?: string[]; botToken?: string } = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const token = over.botToken ?? "bot-tok";
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		options: over.options ?? { guildId: GUILD },
		token: () => token,
		bot: () => createDiscordBotClient({ botToken: token, baseUrl: BASE, fetch }),
		...(over.rules ? { rules: over.rules } : {}),
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, calls, probe };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets, calls } = await check([app, me, guild, member, everything]);
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["bot-tok"]);
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("describes a token with no layer: valid, in the server, and each permission it holds", async () => {
		const { rows } = await check([app, me, guild, member, everything]);
		expect(row(rows, "token")).toMatchObject({ status: "ok", detail: "bot: Holonet (id: 9)" });
		expect(row(rows, "Server membership")).toMatchObject({ status: "ok", detail: "The Holocron" });
		expect(row(rows, "Manage Channels")).toMatchObject({ status: "ok" });
		expect(rows.some((r) => r.status === "heading")).toBe(false);
		expect(rows.filter((r) => r.status === "ok")).toHaveLength(2 + BOT_NEEDS.length);
	});

	it("reports a permission it lacks as info when there is no layer, with the roles it read", async () => {
		const roles = rolesOf({ id: "r1", permissions: missing("ManageWebhooks") });
		const { rows } = await check([app, me, guild, member, roles]);
		expect(row(rows, "Manage Webhooks")).toMatchObject({ status: "info", detail: "not held" });
		expect(row(rows, "Manage Channels")).toMatchObject({ status: "ok" });
	});

	it("takes everything when the bot owns the server, without reading its roles", async () => {
		const owned = ok({ id: GUILD, name: "Mine", owner_id: "7" });
		const { rows, calls } = await check([app, me, owned]);
		expect(rows.filter((r) => r.status === "ok")).toHaveLength(2 + BOT_NEEDS.length);
		expect(calls).toHaveLength(3);
	});

	it("takes everything when a role of the bot has Administrator", async () => {
		const admin = rolesOf({ id: "r1", permissions: permissions(["Administrator"]) });
		const { rows } = await check([app, me, guild, member, admin]);
		expect(rows.filter((r) => r.status === "ok")).toHaveLength(2 + BOT_NEEDS.length);
	});

	it("adds the permissions a layout asks for (Pin Messages, Manage Threads, Add Reactions) to those checked", async () => {
		const layout = {
			pinned: [{ channel: "rules", file: "r.md" }],
			categories: [{ name: "A", channels: [{ name: "f", kind: "forum", starterReactions: ["x"] }] }],
		} as unknown as NotificationsLayout;
		const { rows } = await check([app, me, guild, member, everything], { options: { guildId: GUILD, layout } });
		expect(row(rows, "Pin Messages")).toMatchObject({ status: "info", detail: "not held" });
		expect(row(rows, "Manage Threads")).toMatchObject({ status: "info" });
		expect(row(rows, "Add Reactions")).toMatchObject({ status: "info" });
	});

	it("refuses a webhook URL, which is not a bot token, without calling Discord", async () => {
		const { rows, calls } = await check([], { botToken: "https://discord.com/api/webhooks/1/abc" });
		expect(rows).toEqual([expect.objectContaining({ status: "fail", label: "token" })]);
		expect(calls).toHaveLength(0);
	});

	it("fails and stops when Discord rejects the token", async () => {
		const { rows, calls } = await check([{ status: 401, body: { message: "401: Unauthorized" } }]);
		expect(rows).toEqual([expect.objectContaining({ status: "fail", label: "token" })]);
		expect(calls).toHaveLength(1);
	});

	it("needs a guildId to check anything past the token: an info row, a failure under a layer", async () => {
		const plain = await check([app, me], { options: {} });
		expect(row(plain.rows, "server")).toMatchObject({ status: "info" });
		const layered = await check([app, me], { options: {}, args: ["--layer", "dev"] });
		expect(row(layered.rows, "server")).toMatchObject({ status: "fail" });
	});

	it("says the bot is not in the server, and holds none of the permissions, on a 404", async () => {
		const gone = { status: 404, body: { message: "Unknown Guild" } };
		const { rows } = await check([app, me, gone]);
		expect(row(rows, "Server membership")).toMatchObject({
			status: "info",
			detail: expect.stringContaining("not in server 555"),
		});
		expect(row(rows, "Manage Channels")).toMatchObject({ status: "info", detail: "not held" });
	});

	it("also reads a 403 on the member as not being in the server", async () => {
		const { rows } = await check([
			app,
			me,
			guild,
			{ status: 403, body: { message: "Missing Access" } },
			everything,
		]);
		expect(row(rows, "Server membership")).toMatchObject({ status: "info" });
	});

	it("reports one failing row when the server cannot be read for another reason", async () => {
		const { rows } = await check([app, me, { status: 400, body: { message: "bad request" } }]);
		expect(rows.slice(1)).toEqual([expect.objectContaining({ status: "fail", label: "Server membership" })]);
	});

	describe("checked against a layer", () => {
		it("lists what the layer needs under Should have, all ok for a bot that holds it", async () => {
			const { rows } = await check([app, me, guild, member, everything], { args: ["--layer", "dev"] });
			const at = rows.findIndex((r) => r.status === "heading");
			expect(rows[at]).toEqual({ status: "heading", label: "Should have" });
			expect(rows.slice(at + 1).every((r) => r.status === "ok")).toBe(true);
			expect(rows.filter((r) => r.status === "heading")).toHaveLength(1);
			expect(rows.slice(at + 1)).toHaveLength(1 + BOT_NEEDS.length);
		});

		it("reads --layer=<word> and fails each declared permission the token lacks, in every layer that holds it", async () => {
			for (const layer of ["local", "dev", "ci", "prod"]) {
				const roles = rolesOf({ id: "r1", permissions: missing("ManageRoles") });
				const { rows } = await check([app, me, guild, member, roles], { args: [`--layer=${layer}`] });
				expect(row(rows, "Manage Roles")).toMatchObject({ status: "fail", detail: "not held" });
				expect(row(rows, "Manage Channels")).toMatchObject({ status: "ok" });
			}
		});

		it("fails the membership row when the bot is not in the server", async () => {
			const gone = { status: 404, body: { message: "Unknown Guild" } };
			const { rows } = await check([app, me, gone], { args: ["--layer", "ci"] });
			expect(row(rows, "Server membership")).toMatchObject({ status: "fail" });
		});

		it("also requires what only the layout asks for", async () => {
			const layout = { pinned: [{ channel: "rules", file: "r.md" }] } as unknown as NotificationsLayout;
			const { rows } = await check([app, me, guild, member, everything], {
				options: { guildId: GUILD, layout },
				args: ["--layer", "dev"],
			});
			expect(row(rows, "Pin Messages")).toMatchObject({ status: "fail" });
		});

		it("only describes a layer with no declared expectations, and says so", async () => {
			const { rows } = await check([app, me, guild, member, everything], { args: ["--layer", "staging"] });
			expect(row(rows, "staging")).toMatchObject({ status: "info" });
			expect(rows.some((r) => r.status === "heading")).toBe(false);
			expect(row(rows, "Manage Channels")).toMatchObject({ status: "ok" });
		});

		it("shows a permission the layer must not have under Should not have, failing when the bot holds it", async () => {
			const roles = rolesOf({ id: "r1", permissions: missing("ManageWebhooks") });
			const { rows } = await check([app, me, guild, member, roles], {
				args: ["--layer", "ci"],
				rules: () => ({ guild: "required", ManageChannels: "absent", ManageWebhooks: "absent" }),
			});
			const heading = rows.findIndex((r) => r.label === "Should not have");
			expect(rows.slice(heading + 1)).toEqual([
				expect.objectContaining({ status: "fail", label: "Manage Channels" }),
				{ status: "ok", label: "Manage Webhooks" },
			]);
		});
	});

	it("checks the bot token when the CLI names it with --token-name, and skips the other declared tokens without calling Discord", async () => {
		const named = await check([app, me, guild, member, everything], {
			args: ["--layer", "ci", "--token-name", "HOLOCRON_DISCORD_BOT_TOKEN"],
		});
		expect(named.rows.some((r) => r.label === "Should have")).toBe(true);
		const webhook = await check([], { args: ["--layer", "ci", "--token-name", "HOLOCRON_DISCORD_WEBHOOK"] });
		expect(webhook.rows).toEqual([expect.objectContaining({ status: "info", label: "HOLOCRON_DISCORD_WEBHOOK" })]);
		expect(webhook.calls).toHaveLength(0);
		expect(webhook.secrets).toEqual([]);
	});

	it("copes with a server that has no name and a role with no permissions listed", async () => {
		const bare = ok({ id: GUILD, owner_id: "1" });
		const roles = ok([{ id: GUILD }, { id: "r1", permissions: permissions([...BOT_NEEDS]) }]);
		const { rows } = await check([app, me, bare, member, roles]);
		expect(row(rows, "Server membership")).toMatchObject({ status: "ok", detail: GUILD });
	});
});
