import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import { relaySourcesProblem } from "./relay-sources-problem.js";

const layout = (over: Partial<NotificationsLayout> = {}): NotificationsLayout => ({
	relay: { host: "comlink.example.dev", sources: { vercel: { capability: "deployment" } } },
	categories: [{ name: "A", channels: [{ name: "deploys", feeds: { relay: { vercel: true } } }] }],
	...over,
});

describe("relaySourcesProblem", () => {
	it("is fine with a source and a channel that carries it, and with no sources at all", () => {
		expect(relaySourcesProblem(layout())).toBeUndefined();
		expect(relaySourcesProblem({})).toBeUndefined();
		expect(relaySourcesProblem({ categories: [{ name: "A", channels: [{ name: "x" }] }] })).toBeUndefined();
	});

	it("needs the relay host", () => {
		expect(
			relaySourcesProblem(layout({ relay: { host: "", sources: { vercel: { capability: "dns" } } } }))
		).toMatch(/need `relay.host`/);
	});

	it("refuses an id that is not a lower-case word, or that the tracker already owns", () => {
		const named = (id: string) =>
			layout({
				relay: { host: "h.dev", sources: { [id]: { capability: "dns" } } },
				categories: [{ name: "A", channels: [{ name: "x", feeds: { relay: { [id]: true } } }] }],
			});
		expect(relaySourcesProblem(named("My-Source"))).toMatch(/lower-case letters and digits/);
		expect(relaySourcesProblem(named("1abc"))).toMatch(/starting with a letter/);
		expect(relaySourcesProblem(named("sentry"), "sentry")).toMatch(/error tracker's own source/);
		expect(relaySourcesProblem(named("sentry"))).toBeUndefined();
	});

	it("refuses an unknown capability and events or scope that are not lists of strings", () => {
		const source = (spec: object) => layout({ relay: { host: "h.dev", sources: { vercel: spec as never } } });
		expect(relaySourcesProblem(source({ capability: "errors" }))).toMatch(/`capability` must be one of/);
		expect(relaySourcesProblem(source({}))).toMatch(/`capability` must be one of/);
		expect(relaySourcesProblem(source({ capability: "dns", events: "all" }))).toMatch(/`events` must be a list/);
		expect(relaySourcesProblem(source({ capability: "dns", scope: [1] }))).toMatch(/`scope` must be a list/);
	});

	it("takes `source` as a capability, the GitHub plugin's", () => {
		const source = layout({ relay: { host: "h.dev", sources: { vercel: { capability: "source" } } } });
		expect(relaySourcesProblem(source)).toBeUndefined();
	});

	it("takes a plugin name as `provider`, and refuses anything else", () => {
		const source = (provider: unknown) =>
			layout({ relay: { host: "h.dev", sources: { vercel: { capability: "deployment", provider } as never } } });
		expect(relaySourcesProblem(source("vercel"))).toBeUndefined();
		expect(relaySourcesProblem(source("1password"))).toBeUndefined();
		expect(relaySourcesProblem(source(undefined))).toBeUndefined();
		for (const bad of ["", "Vercel", "@theholocron/holocron-plugin-vercel", "-x", 7, ["vercel"]]) {
			expect(relaySourcesProblem(source(bad))).toMatch(/`vercel`: `provider` must be a plugin name/);
		}
	});

	it("refuses a feed for a source nobody declared, and a source no channel carries", () => {
		const stray = layout({
			categories: [{ name: "A", channels: [{ name: "x", feeds: { relay: { vercel: true, other: true } } }] }],
		});
		expect(relaySourcesProblem(stray)).toMatch(/`feeds.relay.other` names no source/);
		expect(relaySourcesProblem(layout({ categories: [{ name: "A", channels: [{ name: "x" }] }] }))).toMatch(
			/`vercel` is carried by no channel/
		);
		const off = layout({
			categories: [{ name: "A", channels: [{ name: "x", feeds: { relay: { vercel: false } } }] }],
		});
		expect(relaySourcesProblem(off)).toMatch(/carried by no channel/);
	});

	it("refuses two channels that carry one source", () => {
		const two = layout({
			categories: [
				{
					name: "A",
					channels: [
						{ name: "one", feeds: { relay: { vercel: true } } },
						{ name: "two", feeds: { relay: { vercel: true } } },
					],
				},
			],
		});
		expect(relaySourcesProblem(two)).toMatch(/`one` and `two` both carry relay source `vercel`/);
	});

	it("refuses a bad avatar", () => {
		const bad = layout({
			categories: [
				{
					name: "A",
					channels: [{ name: "x", feeds: { relay: { vercel: { avatar: { image: "https://x/y.png" } } } } }],
				},
			],
		});
		expect(relaySourcesProblem(bad)).toMatch(/feeds\.relay\.vercel\.avatar/);
	});

	it("refuses two feeds in one channel whose webhooks would be one, or that share the channel's own", () => {
		const sources = { vercel: { capability: "deployment" as const }, doppler: { capability: "vault" as const } };
		const clash = layout({
			relay: { host: "h.dev", sources },
			categories: [
				{
					name: "A",
					channels: [
						{ name: "x", feeds: { relay: { vercel: { webhook: "Hook" }, doppler: { webhook: "hook" } } } },
					],
				},
			],
		});
		expect(relaySourcesProblem(clash)).toMatch(
			/`doppler` and the webhook for relay source `vercel` are both named hook/
		);
		const own = layout({
			categories: [
				{
					name: "A",
					channels: [{ name: "x", webhook: { name: "Vercel" }, feeds: { relay: { vercel: true } } }],
				},
			],
		});
		expect(relaySourcesProblem(own)).toMatch(/the channel's own webhook are both named Vercel/);
		const apart = layout({
			relay: { host: "h.dev", sources },
			categories: [
				{
					name: "A",
					channels: [
						{ name: "x", feeds: { relay: { vercel: true } } },
						{ name: "y", feeds: { relay: { doppler: true } } },
					],
				},
			],
		});
		expect(relaySourcesProblem(apart)).toBeUndefined();
	});
});
