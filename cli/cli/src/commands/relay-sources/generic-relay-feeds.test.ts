import { describe, expect, it } from "vitest";

import { declaredRelaySources } from "./declared-relay-sources.js";
import { genericRelayFeeds } from "./generic-relay-feeds.js";
import { newRelaySecret } from "./new-relay-secret.js";
import { relayFeedWebhook } from "./relay-feed-webhook.js";

describe("relay source helpers", () => {
	it("names a webhook for its feed or, failing that, the capitalised id", () => {
		expect(relayFeedWebhook("vercel", true)).toBe("Vercel");
		expect(relayFeedWebhook("vercel", {})).toBe("Vercel");
		expect(relayFeedWebhook("vercel", { webhook: "Deploys" })).toBe("Deploys");
	});

	it("lists the feeds that are on, in layout order, and skips the tracker's and the ones turned off", () => {
		const feeds = genericRelayFeeds({
			categories: [
				{
					name: "A",
					channels: [
						{ name: "one", feeds: { errors: true, relay: { vercel: true, off: false } } },
						{ name: "two", feeds: { relay: { doppler: { webhook: "Secrets" } } } },
						{ name: "three" },
					],
				},
				{ name: "B" },
			],
		});
		expect(feeds.map((f) => [f.source, f.channel.name, f.webhook])).toEqual([
			["vercel", "one", "Vercel"],
			["doppler", "two", "Secrets"],
		]);
		expect(genericRelayFeeds({})).toEqual([]);
	});

	it("lists declared sources in the order written", () => {
		expect(
			declaredRelaySources({
				relay: { host: "h", sources: { a: { capability: "dns" }, b: { capability: "vault" } } },
			}).map((d) => d.id)
		).toEqual(["a", "b"]);
		expect(declaredRelaySources({})).toEqual([]);
	});

	it("makes a fresh 64-character hex secret each time", () => {
		const [a, b] = [newRelaySecret(), newRelaySecret()];
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(b);
	});
});
