import { AuthError, ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChannelType, createDiscordBotClient, createDiscordClient } from "../rest.js";
import { DiscordNotifications } from "./notifications.js";

const BASE = "https://discord.test/api/v10";
const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";
const ID = "111";
const TOKEN = "abc123";

function makeNotifs(
	responses: Parameters<typeof stubFetch>[0],
	opts: ConstructorParameters<typeof DiscordNotifications>[1] = {},
	defaultWebhookUrl: () => string = () => {
		throw new AuthError("no Discord webhook URL found");
	}
) {
	const { fetch, calls } = stubFetch(responses);
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return { notifs: new DiscordNotifications(client, opts, defaultWebhookUrl), calls };
}

describe("DiscordNotifications.send — raw webhook URL", () => {
	it("executes the webhook with the message", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }]);
		await notifs.send(WEBHOOK, "hello");
		expect(calls[0]?.url).toBe(`${BASE}/webhooks/${ID}/${TOKEN}`);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({ content: "hello" });
	});

	it("throws ProviderApiError on non-2xx", async () => {
		const { notifs } = makeNotifs([{ status: 400, body: { message: "bad request" } }]);
		await expect(notifs.send(WEBHOOK, "msg")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("DiscordNotifications.send — alias", () => {
	it("resolves a named alias to its webhook URL", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }], {
			webhooks: { deploys: WEBHOOK },
		});
		await notifs.send("deploys", "deployed");
		expect(calls[0]?.url).toContain(`/webhooks/${ID}/${TOKEN}`);
	});
});

describe("DiscordNotifications.send — defaultChannel", () => {
	it("falls back to defaultChannel when channel is empty", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }], { defaultChannel: WEBHOOK });
		await notifs.send("", "hello");
		expect(calls[0]?.url).toContain(`/webhooks/${ID}/${TOKEN}`);
	});

	it("defers the missing-webhook AuthError to send() when nothing resolves the channel", async () => {
		const { notifs } = makeNotifs([]);
		await expect(notifs.send("unknown-alias", "msg")).rejects.toBeInstanceOf(AuthError);
	});

	it("falls back to the resolved webhook URL when no channel and no defaultChannel", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }], {}, () => WEBHOOK);
		await notifs.send("", "hello");
		expect(calls[0]?.url).toContain(`/webhooks/${ID}/${TOKEN}`);
	});

	// The two tests below pass a non-empty, unmapped `channel` to `send()` —
	// that's required to reach resolve()'s own inner `defaultChannel`
	// re-check at all: send()'s own `channel || this.opts.defaultChannel || ""`
	// already substitutes defaultChannel at the call site whenever `channel`
	// itself is falsy, which would make resolve() short-circuit via the
	// alias/raw-URL checks above and never exercise this inner fallback.
	it("resolves resolve()'s inner defaultChannel fallback through the webhooks alias map", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }], {
			webhooks: { ops: WEBHOOK },
			defaultChannel: "ops",
		});
		await notifs.send("totally-unmapped-channel", "hello");
		expect(calls[0]?.url).toContain(`/webhooks/${ID}/${TOKEN}`);
	});

	it("falls through resolve()'s inner defaultChannel fallback to the raw value when it is not itself an alias", async () => {
		const { notifs, calls } = makeNotifs([{ status: 204 }], { defaultChannel: WEBHOOK });
		await notifs.send("totally-unmapped-channel", "hello");
		expect(calls[0]?.url).toContain(`/webhooks/${ID}/${TOKEN}`);
	});
});

// ── provisioning ───────────────────────────────────────────────────────

const GUILD = "1303969001822486568";

function makeProvisioner(responses: Parameters<typeof stubFetch>[0], opts: { guildId?: string } = { guildId: GUILD }) {
	const { fetch, calls } = stubFetch(responses);
	const bot = createDiscordBotClient({ botToken: "bot-tok", baseUrl: BASE, fetch });
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return {
		notifs: new DiscordNotifications(
			client,
			opts,
			() => WEBHOOK,
			() => bot
		),
		calls,
	};
}

const text = (id: string, name: string, parent_id?: string) => ({ id, name, type: ChannelType.Text, parent_id });
const category = (id: string, name: string) => ({ id, name, type: ChannelType.Category });

describe("DiscordNotifications.layout", () => {
	it("carries the declared layout from the provider options", () => {
		const layout = { roles: [{ name: "gatekeepers" }] };
		const notifs = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE }),
			{ guildId: GUILD, layout },
			() => WEBHOOK
		);
		expect(notifs.layout).toBe(layout);
	});
});

describe("DiscordNotifications provisioning without a server id", () => {
	it("fails with a message that names the option to set", async () => {
		const { notifs } = makeProvisioner([{ body: [] }], {});
		await expect(notifs.ensureCategory("ALERTS")).rejects.toThrow(/guildId/);
	});

	it("refuses when no bot client is configured", async () => {
		const notifs = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE }),
			{ guildId: GUILD },
			() => WEBHOOK
		);
		await expect(notifs.ensureCategory("ALERTS")).rejects.toThrow(/no Discord bot client/);
	});
});

describe("DiscordNotifications.ensureCategory", () => {
	it("returns the existing category without creating one (case-insensitive)", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [category("1001", "Alerts")] }]);
		expect(await notifs.ensureCategory("ALERTS")).toEqual({ id: "1001", created: false });
		expect(calls).toHaveLength(1);
	});

	it("creates a category when none matches", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [text("2001", "alerts")] },
			{ body: category("1002", "ALERTS") },
		]);
		expect(await notifs.ensureCategory("ALERTS")).toEqual({ id: "1002", created: true });
		expect(calls[1]).toMatchObject({
			method: "POST",
			url: `${BASE}/guilds/${GUILD}/channels`,
			body: { name: "ALERTS", type: ChannelType.Category },
		});
	});
});

describe("DiscordNotifications.ensureChannel", () => {
	it("returns an existing channel untouched when no category is requested", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [text("2001", "alerts")] }]);
		expect(await notifs.ensureChannel({ name: "alerts" })).toEqual({ id: "2001", created: false });
		expect(calls).toHaveLength(1);
	});

	it("leaves a channel already under the requested category alone", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS"), text("2001", "alerts", "1001")] },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS" })).toEqual({
			id: "2001",
			created: false,
		});
		expect(calls.map((c) => c.method)).toEqual(["GET"]);
	});

	it("moves an existing channel into the requested category", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS"), text("2001", "alerts")] },
			{ body: text("2001", "alerts", "1001") },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS" })).toEqual({
			id: "2001",
			created: false,
		});
		expect(calls[1]).toMatchObject({ method: "PATCH", url: `${BASE}/channels/2001`, body: { parent_id: "1001" } });
	});

	it("creates a channel with its topic and parent", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS")] },
			{ body: text("2002", "alerts", "1001") },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS", topic: "needs a human" })).toEqual({
			id: "2002",
			created: true,
		});
		expect(calls[1]?.body).toEqual({
			name: "alerts",
			type: ChannelType.Text,
			topic: "needs a human",
			parent_id: "1001",
		});
	});

	it("creates a bare channel when neither topic nor category is given", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [] }, { body: text("2003", "dev") }]);
		await notifs.ensureChannel({ name: "dev" });
		expect(calls[1]?.body).toEqual({ name: "dev", type: ChannelType.Text });
	});
});

describe("DiscordNotifications.ensureWebhook", () => {
	const hook = { id: "w1", channel_id: "2001", name: "repo-sync" };

	it("fails clearly when the channel does not exist", async () => {
		const { notifs } = makeProvisioner([{ body: [] }]);
		await expect(notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).rejects.toThrow(
			/no channel named `sync`/
		);
	});

	it("creates a webhook and returns its url", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [text("2001", "sync")] },
			{ body: [] },
			{ body: { ...hook, token: "tk", url: "https://discord.com/api/webhooks/w1/tk" } },
		]);
		expect(await notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).toEqual({
			created: true,
			url: "https://discord.com/api/webhooks/w1/tk",
		});
		expect(calls[2]).toMatchObject({
			method: "POST",
			url: `${BASE}/channels/2001/webhooks`,
			body: { name: "repo-sync" },
		});
	});

	it("reports an existing webhook it cannot read back (no token) without a url", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [text("2001", "sync")] }, { body: [hook] }]);
		expect(await notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).toEqual({ created: false });
		expect(calls).toHaveLength(2);
	});

	it("returns the url of an existing webhook this bot created", async () => {
		const { notifs } = makeProvisioner([{ body: [text("2001", "sync")] }, { body: [{ ...hook, token: "tk" }] }]);
		expect(await notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).toEqual({
			created: false,
			url: "https://discord.com/api/webhooks/w1/tk",
		});
	});

	it("creates a webhook that comes back without a url", async () => {
		const { notifs } = makeProvisioner([{ body: [text("2001", "sync")] }, { body: [] }, { body: hook }]);
		expect(await notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).toEqual({ created: true });
	});
});

describe("DiscordNotifications.ensureRole", () => {
	it("returns an existing role", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [{ id: "r1", name: "Gatekeepers", color: 0, mentionable: true }] },
		]);
		expect(await notifs.ensureRole({ name: "gatekeepers" })).toEqual({ id: "r1", created: false });
		expect(calls).toHaveLength(1);
	});

	it("creates a role with the mentionable flag", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [] },
			{ body: { id: "r2", name: "gatekeepers", color: 0, mentionable: true } },
			{ body: [{ id: "r2", name: "gatekeepers", color: 0, mentionable: true }] },
		]);
		expect(await notifs.ensureRole({ name: "gatekeepers", mentionable: true })).toEqual({
			id: "r2",
			created: true,
		});
		expect(calls[1]).toMatchObject({
			method: "POST",
			url: `${BASE}/guilds/${GUILD}/roles`,
			body: { name: "gatekeepers", mentionable: true },
		});
	});

	it("creates a role without a mentionable flag when none is given", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [] },
			{ body: { id: "r3", name: "x", color: 0, mentionable: false } },
			{ body: [{ id: "r3", name: "x", color: 0, mentionable: false }] },
		]);
		await notifs.ensureRole({ name: "x" });
		expect(calls[1]?.body).toEqual({ name: "x" });
	});
});

describe("DiscordNotifications — reconciling and resolving existing channels", () => {
	const announce = (id: string, name: string) => ({ id, name, type: ChannelType.Announcement });

	it("updates the topic of an existing channel when the layout asks for a different one", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [{ ...text("2001", "alerts"), topic: "old" }] },
			{ body: text("2001", "alerts") },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", topic: "new" })).toEqual({ id: "2001", created: false });
		expect(calls[1]).toMatchObject({ method: "PATCH", url: `${BASE}/channels/2001`, body: { topic: "new" } });
	});

	it("sets a topic on an existing channel that has none", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [text("2001", "alerts")] },
			{ body: text("2001", "alerts") },
		]);
		await notifs.ensureChannel({ name: "alerts", topic: "now has one" });
		expect(calls[1]).toMatchObject({ method: "PATCH", body: { topic: "now has one" } });
	});

	it("leaves a matching topic alone and never clears one that was not asked about", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [{ ...text("2001", "alerts"), topic: "same" }] }]);
		await notifs.ensureChannel({ name: "alerts", topic: "same" });
		expect(calls).toHaveLength(1);
		const second = makeProvisioner([{ body: [{ ...text("2001", "alerts"), topic: "kept" }] }]);
		await second.notifs.ensureChannel({ name: "alerts" });
		expect(second.calls).toHaveLength(1);
	});

	it("reuses an existing announcement channel instead of creating a text one", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [announce("2005", "releases")] }]);
		expect(await notifs.ensureChannel({ name: "releases" })).toEqual({ id: "2005", created: false });
		expect(calls).toHaveLength(1);
	});

	it("picks the same-named channel that is already under the requested category", async () => {
		const channels = [
			category("1001", "ALERTS"),
			category("1002", "AUTOMATION"),
			text("2001", "sync", "1002"),
			text("2002", "sync", "1001"),
		];
		const { notifs, calls } = makeProvisioner([{ body: channels }]);
		expect(await notifs.ensureChannel({ name: "sync", category: "ALERTS" })).toEqual({
			id: "2002",
			created: false,
		});
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("creates a new channel rather than stealing one from a different category", async () => {
		const channels = [category("1001", "ALERTS"), category("1002", "AUTOMATION"), text("2001", "sync", "1002")];
		const { notifs, calls } = makeProvisioner([{ body: channels }, { body: text("2009", "sync", "1001") }]);
		expect(await notifs.ensureChannel({ name: "sync", category: "ALERTS" })).toEqual({ id: "2009", created: true });
		expect(calls[1]).toMatchObject({ method: "POST", body: { name: "sync", parent_id: "1001" } });
	});

	it("attaches a webhook to the channel in the requested category, not just any same-named one", async () => {
		const channels = [
			category("1001", "ALERTS"),
			category("1002", "AUTOMATION"),
			text("2001", "sync", "1002"),
			text("2002", "sync", "1001"),
		];
		const { notifs, calls } = makeProvisioner([
			{ body: channels },
			{ body: [] },
			{ body: { id: "w1", name: "sync", channel_id: "2002", token: "tk" } },
		]);
		await notifs.ensureWebhook({ channel: "sync", name: "sync", category: "ALERTS" });
		expect(calls[1]?.url).toBe(`${BASE}/channels/2002/webhooks`);
	});

	it("matches an existing webhook whose name differs only by case", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [text("2001", "sync")] },
			{ body: [{ id: "w1", name: "Repo-Sync", channel_id: "2001" }] },
		]);
		expect(await notifs.ensureWebhook({ channel: "sync", name: "repo-sync" })).toEqual({ created: false });
		expect(calls).toHaveLength(2);
	});

	it("treats an existing webhook with no name as a non-match", async () => {
		const { notifs } = makeProvisioner([
			{ body: [text("2001", "sync")] },
			{ body: [{ id: "w1", name: null, channel_id: "2001" }] },
			{ body: { id: "w2", name: "sync", channel_id: "2001", token: "tk" } },
		]);
		expect((await notifs.ensureWebhook({ channel: "sync", name: "sync" })).created).toBe(true);
	});
});

describe("DiscordNotifications.whoami", () => {
	it("names the server and the bot when the token works and the server is visible", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: { id: "9", username: "Holonet", bot: true } },
			{ body: { id: GUILD, name: "Holocron" } },
		]);
		expect(await notifs.whoami()).toEqual({ target: "Holocron (as Holonet)" });
		expect(calls.map((c) => c.url)).toEqual([`${BASE}/users/@me`, `${BASE}/guilds/${GUILD}`]);
	});

	it("is null, and calls nothing, for a post-only config with no server id", async () => {
		const { notifs, calls } = makeProvisioner([], {});
		expect(await notifs.whoami()).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it("fails, naming the missing option, when a layout is declared without a server id", async () => {
		const { fetch } = stubFetch([]);
		const notifs = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE, fetch }),
			{ layout: { roles: [{ name: "gatekeepers" }] } },
			() => WEBHOOK,
			() => createDiscordBotClient({ botToken: "t", baseUrl: BASE, fetch })
		);
		await expect(notifs.whoami()).rejects.toThrow(/`layout` is set but `guildId` is not/);
	});

	it("fails when the bot cannot see the server", async () => {
		const { notifs } = makeProvisioner([
			{ body: { id: "9", username: "Holonet" } },
			{ status: 404, body: { message: "Unknown Guild" } },
		]);
		await expect(notifs.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("DiscordNotifications — channel list is fetched once per run", () => {
	it("makes one GET for the whole sequence of ensureCategory, ensureChannel and ensureWebhook", async () => {
		const channels = [category("1001", "ALERTS"), text("2001", "alerts", "1001"), text("2002", "errors", "1001")];
		const { notifs, calls } = makeProvisioner([
			{ body: channels }, // the only channel-list GET
			{ body: [] }, // alerts webhooks
			{ body: { id: "w1", name: "alerts", channel_id: "2001", token: "tk" } },
			{ body: [] }, // errors webhooks
			{ body: { id: "w2", name: "errors", channel_id: "2002", token: "tk" } },
		]);
		await notifs.ensureCategory("ALERTS");
		await notifs.ensureChannel({ name: "alerts", category: "ALERTS" });
		await notifs.ensureChannel({ name: "errors", category: "ALERTS" });
		await notifs.ensureWebhook({ channel: "alerts", name: "alerts", category: "ALERTS" });
		await notifs.ensureWebhook({ channel: "errors", name: "errors", category: "ALERTS" });
		const listCalls = calls.filter((c) => c.method === "GET" && c.url === `${BASE}/guilds/${GUILD}/channels`);
		expect(listCalls).toHaveLength(1);
	});

	it("sees a category it just created without refetching the list", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [] },
			{ body: category("1009", "NEW") },
			{ body: text("2009", "hello", "1009") },
		]);
		await notifs.ensureCategory("NEW");
		await notifs.ensureChannel({ name: "hello", category: "NEW" });
		expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
		expect(calls[2]).toMatchObject({ method: "POST", body: { name: "hello", parent_id: "1009" } });
	});

	it("does not create a channel twice when asked for it twice in one run", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [] }, { body: text("2010", "dup") }]);
		await notifs.ensureChannel({ name: "dup" });
		expect(await notifs.ensureChannel({ name: "dup" })).toEqual({ id: "2010", created: false });
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
	});

	it("keeps its copy accurate after moving a channel into a category", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS"), text("2001", "alerts")] },
			{ body: text("2001", "alerts", "1001") },
		]);
		await notifs.ensureChannel({ name: "alerts", category: "ALERTS" });
		await notifs.ensureChannel({ name: "alerts", category: "ALERTS" });
		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
	});
});

describe("DiscordNotifications — channel list under failure and concurrency", () => {
	it("shares one in-flight fetch between callers that start together", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [category("1001", "ALERTS")] }]);
		const results = await Promise.all([
			notifs.ensureCategory("ALERTS"),
			notifs.ensureCategory("alerts"),
			notifs.ensureCategory("Alerts"),
		]);
		expect(results.every((r) => r.id === "1001" && !r.created)).toBe(true);
		expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
	});

	it("does not remember a failed list fetch", async () => {
		const { notifs, calls } = makeProvisioner([
			{ status: 500, text: "oops" },
			{ body: [category("1001", "ALERTS")] },
		]);
		await expect(notifs.ensureCategory("ALERTS")).rejects.toBeInstanceOf(ProviderApiError);
		expect(await notifs.ensureCategory("ALERTS")).toEqual({ id: "1001", created: false });
		expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
	});

	it("refetches after a failed create, so an ambiguous failure cannot lead to a duplicate", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [] }, // first list
			{ status: 500, text: "timeout" }, // create fails, but Discord may have applied it
			{ body: [category("1007", "ALERTS")] }, // the refetch shows it did
		]);
		await expect(notifs.ensureCategory("ALERTS")).rejects.toBeInstanceOf(ProviderApiError);
		expect(await notifs.ensureCategory("ALERTS")).toEqual({ id: "1007", created: false });
		expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
	});

	it("refetches after a failed edit as well", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [{ ...text("2001", "alerts"), topic: "old" }] },
			{ status: 500, text: "timeout" },
			{ body: [{ ...text("2001", "alerts"), topic: "new" }] },
		]);
		await expect(notifs.ensureChannel({ name: "alerts", topic: "new" })).rejects.toBeInstanceOf(ProviderApiError);
		await notifs.ensureChannel({ name: "alerts", topic: "new" });
		expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH", "GET"]);
	});
});

describe("DiscordNotifications.ensureRole — an existing role that disagrees", () => {
	const role = (over: Record<string, unknown> = {}) => ({
		id: "4001",
		name: "gatekeepers",
		color: 0,
		mentionable: false,
		hoist: false,
		permissions: "0",
		...over,
	});

	it("fixes a mentionable flag that disagrees, sending only that field", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [role()] }, { body: role({ mentionable: true }) }]);
		expect(await notifs.ensureRole({ name: "gatekeepers", mentionable: true })).toEqual({
			id: "4001",
			created: false,
			updated: ["mentionable"],
		});
		expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
		expect(calls[1]?.url).toBe(`${BASE}/guilds/${GUILD}/roles/4001`);
		expect(calls[1]?.body).toEqual({ mentionable: true });
	});

	it("fixes colour, hoist and permissions together", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [role()] },
			{ body: role({ color: 0xf0b232, hoist: true, permissions: "3072" }) },
		]);
		const out = await notifs.ensureRole({
			name: "gatekeepers",
			color: "#f0b232",
			hoist: true,
			permissions: ["ViewChannel", "SendMessages"],
		});
		expect(out.updated).toEqual(["colour", "hoist", "permissions"]);
		expect(calls[1]?.body).toEqual({ color: 0xf0b232, hoist: true, permissions: "3072" });
	});

	it("sends nothing when the role already matches, or when the layout does not say", async () => {
		const match = makeProvisioner([
			{ body: [role({ mentionable: true, color: 0xf0b232, hoist: true, permissions: "3072" })] },
		]);
		expect(
			await match.notifs.ensureRole({
				name: "gatekeepers",
				mentionable: true,
				color: "#F0B232",
				hoist: true,
				permissions: ["ViewChannel", "SendMessages"],
			})
		).toEqual({ id: "4001", created: false });
		expect(match.calls).toHaveLength(1);
		const silent = makeProvisioner([{ body: [role()] }]);
		expect(await silent.notifs.ensureRole({ name: "gatekeepers" })).toEqual({ id: "4001", created: false });
		expect(silent.calls.map((c) => c.method)).toEqual(["GET"]);
	});

	it("treats #000000 as Discord's default colour, so a black role needs no change", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [role()] }]);
		expect(await notifs.ensureRole({ name: "gatekeepers", color: "#000000" })).toEqual({
			id: "4001",
			created: false,
		});
		expect(calls.map((c) => c.method)).toEqual(["GET"]);
	});

	it("refuses to guess between two roles with the same name", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [role(), role({ id: "4009", name: "Gatekeepers" })] }]);
		await expect(notifs.ensureRole({ name: "gatekeepers", hoist: true })).rejects.toThrow(
			/2 roles are named `gatekeepers` \(ids 4001, 4009\)/
		);
		expect(calls).toHaveLength(1);
	});

	it("treats a role with no hoist flag as not hoisted", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [{ id: "4001", name: "gatekeepers", color: 0, mentionable: false }] },
		]);
		expect(await notifs.ensureRole({ name: "gatekeepers", hoist: false })).toEqual({ id: "4001", created: false });
		expect(calls.map((c) => c.method)).toEqual(["GET"]);
	});

	it("creates a missing role with its colour, hoist and permissions", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [] },
			{ body: role({ id: "4002" }) },
			{ body: [role({ id: "4002" })] },
		]);
		expect(
			await notifs.ensureRole({
				name: "gatekeepers",
				color: "#000001",
				hoist: true,
				permissions: ["ViewChannel"],
			})
		).toEqual({ id: "4002", created: true });
		expect(calls[1]?.body).toMatchObject({ name: "gatekeepers", color: 1, hoist: true, permissions: "1024" });
	});

	it("says so when a second run created the same role at the same time", async () => {
		const { notifs } = makeProvisioner([
			{ body: [] },
			{ body: role({ id: "4002" }) },
			{ body: [role({ id: "4002" }), role({ id: "4003" })] },
		]);
		await expect(notifs.ensureRole({ name: "gatekeepers" })).rejects.toThrow(
			/created role `gatekeepers` \(id 4002\) but 2 roles now have that name \(ids 4002, 4003\).*delete the extra one/
		);
	});

	it("says so when the role that comes back is not what was sent, instead of reporting success", async () => {
		const { notifs } = makeProvisioner([{ body: [role()] }, { body: role({ mentionable: false, hoist: false }) }]);
		await expect(notifs.ensureRole({ name: "gatekeepers", mentionable: true, hoist: true })).rejects.toThrow(
			/sent mentionable, hoist but the role came back different/
		);
	});

	it("rejects a bad colour or permission name before touching the server", async () => {
		const colour = makeProvisioner([]);
		await expect(colour.notifs.ensureRole({ name: "x", color: "red" })).rejects.toThrow(/use #rrggbb/);
		const perm = makeProvisioner([]);
		await expect(perm.notifs.ensureRole({ name: "x", permissions: ["Nope"] })).rejects.toThrow(
			/unknown Discord permission/
		);
		expect(colour.calls).toHaveLength(0);
		expect(perm.calls).toHaveLength(0);
	});
});

describe("DiscordNotifications.inspect — role appearance", () => {
	it("reports a role's colour as #rrggbb, its hoist, and its permissions by name", async () => {
		const { notifs } = makeProvisioner([
			{ body: [] },
			{
				body: [
					{
						id: "4001",
						name: "gatekeepers",
						color: 0xf0b232,
						mentionable: true,
						hoist: true,
						permissions: "3072",
					},
					{ id: "4002", name: "plain", color: 0, mentionable: false },
				],
			},
		]);
		const found = await notifs.inspect({ roles: [{ name: "gatekeepers" }, { name: "plain" }] });
		expect(found.roles).toEqual([
			{
				name: "gatekeepers",
				id: "4001",
				mentionable: true,
				color: "#f0b232",
				hoist: true,
				permissions: ["ViewChannel", "SendMessages"],
			},
			{ name: "plain", id: "4002", mentionable: false, color: "#000000" },
		]);
	});
});

describe("DiscordNotifications.inspect", () => {
	const layout = {
		categories: [{ name: "ALERTS", channels: [{ name: "alerts", webhook: true }, { name: "errors" }] }],
		roles: [{ name: "gatekeepers" }],
	};

	it("reports categories, channels with their category and topic, and roles, changing nothing", async () => {
		const { notifs, calls } = makeProvisioner([
			{
				body: [
					category("1001", "ALERTS"),
					{ ...text("2001", "alerts", "1001"), topic: "needs a human" },
					text("2002", "errors", "1001"),
					text("2003", "general"),
				],
			},
			{ body: [{ id: "w1", name: "alerts", channel_id: "2001" }] },
			{ body: [{ id: "4001", name: "gatekeepers", color: 0, mentionable: true }] },
		]);
		const found = await notifs.inspect(layout);
		expect(found.categories).toEqual(["ALERTS"]);
		expect(found.channels).toEqual([
			{ name: "alerts", category: "ALERTS", topic: "needs a human", webhooks: ["alerts"] },
			{ name: "errors", category: "ALERTS", webhooks: [] },
			{ name: "general", webhooks: [] },
		]);
		expect(found.roles).toEqual([{ name: "gatekeepers", id: "4001", mentionable: true, color: "#000000" }]);
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("lists webhooks only for channels the layout gives one, so the cost follows the layout", async () => {
		const { notifs, calls } = makeProvisioner([
			{
				body: [
					category("1001", "ALERTS"),
					text("2001", "alerts", "1001"),
					text("2002", "errors", "1001"),
					text("2003", "general"),
				],
			},
			{ body: [] },
			{ body: [] },
		]);
		await notifs.inspect(layout);
		expect(calls.filter((c) => c.url.endsWith("/webhooks"))).toHaveLength(1);
		expect(calls.find((c) => c.url.endsWith("/webhooks"))?.url).toBe(`${BASE}/channels/2001/webhooks`);
	});

	it("handles a layout whose category declares no channels, fetching no webhooks", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [category("1001", "EMPTY")] }, { body: [] }]);
		const found = await notifs.inspect({ categories: [{ name: "EMPTY" }] });
		expect(found.categories).toEqual(["EMPTY"]);
		expect(found.channels).toEqual([]);
		expect(calls.filter((c) => c.url.endsWith("/webhooks"))).toHaveLength(0);
	});

	it("includes announcement channels, and tolerates a webhook with no name", async () => {
		const { notifs } = makeProvisioner([
			{ body: [{ id: "2005", name: "alerts", type: ChannelType.Announcement }] },
			{ body: [{ id: "w1", name: null, channel_id: "2005" }] },
			{ body: [] },
		]);
		const found = await notifs.inspect(layout);
		expect(found.channels[0]).toMatchObject({ name: "alerts", webhooks: [""] });
	});

	it("shares the channel list with the ensure* methods instead of fetching it twice", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [category("1001", "ALERTS")] }, { body: [] }]);
		await notifs.ensureCategory("ALERTS");
		await notifs.inspect({ roles: [] });
		expect(calls.filter((c) => c.url === `${BASE}/guilds/${GUILD}/channels`)).toHaveLength(1);
	});
});

describe("DiscordNotifications.inspect — one failing read does not discard the rest", () => {
	const layout = {
		categories: [
			{
				name: "ALERTS",
				channels: [
					{ name: "alerts", webhook: true },
					{ name: "sync", webhook: true },
				],
			},
		],
		roles: [{ name: "gatekeepers" }],
	};
	const channels = [category("1001", "ALERTS"), text("2001", "alerts", "1001"), text("2002", "sync", "1001")];

	it("reports a channel whose webhook list failed on that channel only, and still lists the others", async () => {
		const { notifs } = makeProvisioner([
			{ body: channels },
			{ status: 403, text: '{"message":"Missing Access","code":50001}' },
			{ body: [{ id: "w2", name: "sync", channel_id: "2002" }] },
			{ body: [{ id: "4001", name: "gatekeepers", color: 0, mentionable: true }] },
		]);
		const found = await notifs.inspect(layout);
		expect(found.channels.map((c) => [c.name, c.webhooks, c.webhooksError !== undefined])).toEqual([
			["alerts", [], true],
			["sync", ["sync"], false],
		]);
		expect(found.channels[0]?.webhooksError).toContain("Missing Access");
		expect(found.roles).toHaveLength(1);
		expect(found.rolesError).toBeUndefined();
	});

	it("reports a failed roles read as rolesError and keeps the channels it already read", async () => {
		const { notifs } = makeProvisioner([
			{ body: channels },
			{ body: [] },
			{ body: [] },
			{ status: 500, text: "boom" },
		]);
		const found = await notifs.inspect(layout);
		expect(found.roles).toEqual([]);
		expect(found.rolesError).toMatch(/→ 500/);
		expect(found.channels).toHaveLength(2);
		expect(found.categories).toEqual(["ALERTS"]);
	});

	it("does not ask for roles at all when the layout declares none", async () => {
		const { notifs, calls } = makeProvisioner([{ body: channels }, { body: [] }, { body: [] }]);
		const found = await notifs.inspect({ categories: layout.categories });
		expect(calls.some((c) => c.url.endsWith("/roles"))).toBe(false);
		expect(found.roles).toEqual([]);
		expect(found.rolesError).toBeUndefined();
	});

	it("describes a failure that is not a provider error by its message alone", async () => {
		const stub = stubFetch([{ body: channels }]);
		const bot = createDiscordBotClient({ botToken: "t", baseUrl: BASE, fetch: stub.fetch });
		const broken = {
			...bot,
			channels: {
				...bot.channels,
				webhooks: async () => {
					throw new Error("socket hang up");
				},
			},
		};
		const notifs = new DiscordNotifications(
			createDiscordClient({ baseUrl: BASE, fetch: stub.fetch }),
			{ guildId: GUILD },
			() => WEBHOOK,
			() => broken as typeof bot
		);
		const found = await notifs.inspect({ categories: layout.categories });
		expect(found.channels[0]?.webhooksError).toBe("socket hang up");
	});
});

describe("DiscordNotifications.validateLayout", () => {
	const { notifs } = makeProvisioner([]);

	it("accepts a layout whose role colours and permissions are valid, or that has no roles", () => {
		expect(notifs.validateLayout({})).toBeUndefined();
		expect(
			notifs.validateLayout({
				roles: [{ name: "x", color: "#fff000", permissions: ["ViewChannel"] }, { name: "y" }],
			})
		).toBeUndefined();
	});

	it("names the role with a bad colour or permission", () => {
		expect(notifs.validateLayout({ roles: [{ name: "x", color: "red" }] })).toMatch(/role `x`: .*use #rrggbb/);
		expect(notifs.validateLayout({ roles: [{ name: "y", permissions: ["Nope"] }] })).toMatch(
			/role `y`: .*unknown Discord permission/
		);
	});
});
