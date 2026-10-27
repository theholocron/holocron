import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Dns, NotificationsLayout, Workers } from "../../plugin/index.js";
import { deployRelay, errorsFeedWebhook, relayProblem, relayWebhookBinding, relayZone, wantsRelay } from "./relay.js";

describe("relay helpers", () => {
	it("names the feed's webhook for the tracker, capitalised, unless the feed says otherwise", () => {
		expect(errorsFeedWebhook(true, { providerName: "sentry" })).toBe("Sentry");
		expect(errorsFeedWebhook({}, { providerName: "sentry" })).toBe("Sentry");
		expect(errorsFeedWebhook({ webhook: "Tracker" }, { providerName: "sentry" })).toBe("Tracker");
	});

	it("names the Worker binding for a source the way apps/comlink reads it", () => {
		expect(relayWebhookBinding("sentry")).toBe("COMLINK_SENTRY_WEBHOOK");
	});

	it("takes the zone from the layout, else the host's last two labels", () => {
		expect(relayZone({ host: "comlink.theholocron.dev" })).toBe("theholocron.dev");
		expect(relayZone({ host: "a.b.example.dev", zone: "b.example.dev" })).toBe("b.example.dev");
	});

	it("sees whether any channel is fed, and has no complaint when none is", () => {
		const none: NotificationsLayout = { categories: [{ name: "A", channels: [{ name: "x" }] }] };
		expect(wantsRelay(none)).toBe(false);
		expect(wantsRelay({})).toBe(false);
		expect(relayProblem(none)).toBeUndefined();
		const fed: NotificationsLayout = {
			relay: { host: "h.example.dev" },
			categories: [{ name: "A", channels: [{ name: "x", feeds: { errors: true } }] }],
		};
		expect(wantsRelay(fed)).toBe(true);
		expect(relayProblem(fed, { providerName: "sentry" })).toBeUndefined();
	});

	const withFeeds = (feeds: object, webhook?: unknown): NotificationsLayout =>
		({
			relay: { host: "h.example.dev" },
			categories: [{ name: "A", channels: [{ name: "x", ...(webhook ? { webhook } : {}), feeds }] }],
		}) as NotificationsLayout;

	it("rejects a relay webhook that shares a name with the monitoring feed's, without regard to case", () => {
		const sentry = { providerName: "sentry" };
		const checkly = { providerName: "checkly" };
		expect(relayProblem(withFeeds({ errors: true, monitoring: true }), sentry, checkly)).toBeUndefined();
		expect(relayProblem(withFeeds({ errors: { webhook: "checkly" }, monitoring: true }), sentry, checkly)).toMatch(
			/relay webhook and the monitoring webhook are both named Checkly/
		);
		expect(
			relayProblem(withFeeds({ errors: { webhook: "Probe" }, monitoring: { webhook: "PROBE" } }), sentry, checkly)
		).toMatch(/both named PROBE/);
	});

	it("checks the error feed's picture like the monitoring feed's", () => {
		const sentry = { providerName: "sentry" };
		expect(relayProblem(withFeeds({ errors: { avatar: {} } }), sentry)).toMatch(
			/needs a `url`, an `image`, or both/
		);
		expect(relayProblem(withFeeds({ errors: { avatar: { image: "https://x/y.png" } } }), sentry)).toMatch(
			/must be a file in the repo/
		);
		expect(relayProblem(withFeeds({ errors: { avatar: { url: "http://x/y.png" } } }), sentry)).toMatch(
			/must be an https/
		);
	});
});

describe("deployRelay", () => {
	const collaborators = () => ({
		workers: { deployScript: vi.fn(async (n: string) => ({ scriptName: n })) } as unknown as Workers,
		dns: { upsertRecord: vi.fn() } as unknown as Dns,
	});

	it("reads the built Worker from the file system by default", async () => {
		const root = await mkdtemp(join(tmpdir(), "relay-"));
		await mkdir(join(root, "apps/comlink/dist"), { recursive: true });
		await writeFile(join(root, "apps/comlink/dist/worker.js"), "export default {}");
		const c = collaborators();
		const out = await deployRelay({
			relay: { host: "comlink.example.dev" },
			source: "sentry",
			webhook: "https://hook",
			repoRoot: root,
			...c,
		});
		expect(out).toEqual({ host: "comlink.example.dev", script: "comlink" });
		expect(c.workers.deployScript).toHaveBeenCalledWith(
			"comlink",
			expect.objectContaining({ code: "export default {}" })
		);
	});

	it("leaves the host alone when the deploy fails", async () => {
		const c = collaborators();
		(c.workers.deployScript as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
		await expect(
			deployRelay({
				relay: { host: "comlink.example.dev" },
				source: "sentry",
				webhook: "https://hook",
				repoRoot: "/r",
				readCode: async () => "export default {}",
				...c,
			})
		).rejects.toThrow("boom");
		expect(c.dns.upsertRecord).not.toHaveBeenCalled();
	});

	it("points the host at the Worker only after it is deployed", async () => {
		const order: string[] = [];
		const workers = {
			deployScript: vi.fn(async (n: string) => (order.push("deploy"), { scriptName: n })),
		} as unknown as Workers;
		const dns = { upsertRecord: vi.fn(async () => void order.push("dns")) } as unknown as Dns;
		await deployRelay({
			relay: { host: "comlink.example.dev" },
			source: "sentry",
			webhook: "https://hook",
			repoRoot: "/r",
			readCode: async () => "x",
			workers,
			dns,
		});
		expect(order).toEqual(["deploy", "dns"]);
	});

	it("says to build the Worker when the file is not there, before touching DNS", async () => {
		const c = collaborators();
		await expect(
			deployRelay({
				relay: { host: "comlink.example.dev" },
				source: "sentry",
				webhook: "https://hook",
				repoRoot: join(tmpdir(), "no-such-repo"),
				...c,
			})
		).rejects.toThrow(/not built/);
		expect(c.dns.upsertRecord).not.toHaveBeenCalled();
	});
});
