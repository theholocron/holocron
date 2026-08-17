import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { DiscordNotifications } from "../capabilities/notifications.js";
import { createDiscordClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://discord.test/api/v10";
const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";
const ID = "111";
const TOKEN = "abc123";

function makeNotifs(
	responses: Parameters<typeof stubFetch>[0],
	opts: ConstructorParameters<typeof DiscordNotifications>[1] = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return { notifs: new DiscordNotifications(client, opts), calls };
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

	it("throws when channel is unknown and no defaultChannel", async () => {
		const { notifs } = makeNotifs([]);
		await expect(notifs.send("unknown-alias", "msg")).rejects.toThrow("unknown channel");
	});
});
