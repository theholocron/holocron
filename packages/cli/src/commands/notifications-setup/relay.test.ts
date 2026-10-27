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
