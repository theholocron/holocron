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
			{ body: [category("1001", "ALERTS")] },
			{ body: [category("1001", "ALERTS"), text("2001", "alerts", "1001")] },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS" })).toEqual({
			id: "2001",
			created: false,
		});
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
	});

	it("moves an existing channel into the requested category", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS")] },
			{ body: [category("1001", "ALERTS"), text("2001", "alerts")] },
			{ body: text("2001", "alerts", "1001") },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS" })).toEqual({
			id: "2001",
			created: false,
		});
		expect(calls[2]).toMatchObject({ method: "PATCH", url: `${BASE}/channels/2001`, body: { parent_id: "1001" } });
	});

	it("creates a channel with its topic and parent", async () => {
		const { notifs, calls } = makeProvisioner([
			{ body: [category("1001", "ALERTS")] },
			{ body: [category("1001", "ALERTS")] },
			{ body: text("2002", "alerts", "1001") },
		]);
		expect(await notifs.ensureChannel({ name: "alerts", category: "ALERTS", topic: "needs a human" })).toEqual({
			id: "2002",
			created: true,
		});
		expect(calls[2]?.body).toEqual({
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
