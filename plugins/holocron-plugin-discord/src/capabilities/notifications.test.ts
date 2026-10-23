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
	const role = (mentionable: boolean) => ({ id: "4001", name: "gatekeepers", color: 0, mentionable });

	it("fails when the role exists but is not mentionable and the layout wants it mentionable", async () => {
		const { notifs, calls } = makeProvisioner([{ body: [role(false)] }]);
		await expect(notifs.ensureRole({ name: "gatekeepers", mentionable: true })).rejects.toThrow(
			/exists with mentionable=false but the layout wants true.*not supported yet/
		);
		expect(calls).toHaveLength(1);
	});

	it("fails the other way round too", async () => {
		const { notifs } = makeProvisioner([{ body: [role(true)] }]);
		await expect(notifs.ensureRole({ name: "gatekeepers", mentionable: false })).rejects.toThrow(
			/mentionable=true but the layout wants false/
		);
	});

	it("accepts an existing role that already matches, or when the layout does not say", async () => {
		const match = makeProvisioner([{ body: [role(true)] }]);
		expect(await match.notifs.ensureRole({ name: "gatekeepers", mentionable: true })).toEqual({
			id: "4001",
			created: false,
		});
		const silent = makeProvisioner([{ body: [role(false)] }]);
		expect(await silent.notifs.ensureRole({ name: "gatekeepers" })).toEqual({ id: "4001", created: false });
	});
});
