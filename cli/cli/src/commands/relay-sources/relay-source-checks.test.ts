import { describe, expect, it, vi } from "vitest";

import { MissingTokenError, type NotificationsLayout, type RelaySourceState } from "../../plugin/index.js";
import { relaySourceChecks } from "./relay-source-checks.js";
import type { RelaySourceProvider } from "./relay-sources.type.js";

const layout: NotificationsLayout = {
	relay: {
		host: "comlink.example.dev",
		sources: { vercel: { capability: "deployment", events: ["deployment.error"], scope: ["prj_1"] } },
	},
};

const provider = (inspect?: RelaySourceProvider["inspectRelaySource"]): RelaySourceProvider => ({
	key: "deployment",
	providerName: "vercel",
	...(inspect ? { inspectRelaySource: inspect } : {}),
});
const run = (p: RelaySourceProvider | undefined, l: NotificationsLayout = layout) =>
	relaySourceChecks({ layout: l, provider: () => p, missingReason: (c) => `no \`${c}\` provider` });
const good: RelaySourceState = {
	exists: true,
	enabled: true,
	events: ["deployment.error", "deployment.ready"],
	scope: ["prj_1"],
	hasSecret: true,
};

describe("relaySourceChecks", () => {
	it("has no rows without relay sources", async () => {
		expect(await run(provider(), {})).toEqual([]);
		expect(await run(provider(), { relay: { host: "h.dev" } })).toEqual([]);
	});

	it("passes for a webhook that exists, is on and holds every declared event and scope (extras are fine)", async () => {
		const inspect = vi.fn(async () => good);
		const [row] = await run(provider(inspect));
		expect(row).toMatchObject({ id: "relay-source:vercel", status: "pass" });
		expect(row!.detail).toContain("vercel posts to https://comlink.example.dev/vercel");
		expect(inspect).toHaveBeenCalledWith({
			source: "vercel",
			url: "https://comlink.example.dev/vercel",
			name: "Vercel",
			events: ["deployment.error"],
			scope: ["prj_1"],
		});
	});

	it("fails with one line per gap", async () => {
		const [missing] = await run(provider(async () => ({ exists: false })));
		expect(missing).toMatchObject({ status: "fail" });
		expect(missing!.problems).toEqual(["no vercel webhook posts to https://comlink.example.dev/vercel"]);
		const [gaps] = await run(
			provider(async () => ({ exists: true, enabled: false, events: ["x"], scope: [], hasSecret: false }))
		);
		expect(gaps!.problems).toEqual([
			"the webhook is switched off",
			"not subscribed to deployment.error",
			"does not cover prj_1",
			"the webhook has no signing secret",
		]);
	});

	it("does not compare what the vendor does not report", async () => {
		const [row] = await run(provider(async () => ({ exists: true })));
		expect(row!.status).toBe("pass");
	});

	it("skips for a missing provider, one that cannot read, a missing host and a missing token", async () => {
		expect((await run(undefined))[0]).toMatchObject({ status: "skip", detail: "no `deployment` provider" });
		expect((await run(provider()))[0]).toMatchObject({
			status: "skip",
			detail: "the `vercel` provider cannot read its webhooks",
		});
		expect((await run(provider(), { relay: { host: "", sources: layout.relay!.sources } }))[0]).toMatchObject({
			status: "skip",
		});
		const noToken = provider(async () => {
			throw new MissingTokenError("no vercel token");
		});
		expect((await run(noToken))[0]).toMatchObject({ status: "skip", detail: "no vercel token" });
	});

	it("fails with the provider's message for any other error", async () => {
		const [row] = await run(
			provider(async () => {
				throw new Error("500 oops");
			})
		);
		expect(row).toMatchObject({ status: "fail" });
		expect(row!.problems[0]).toContain("500 oops");
	});
});

describe("relaySourceChecks — what is asked", () => {
	it("passes the layout's name and options, and leaves out events and scope it does not state", async () => {
		const inspect = vi.fn(async () => ({ exists: true }));
		await run(provider(inspect), {
			relay: { host: "h.dev", sources: { doppler: { capability: "vault", name: "Secrets", options: { x: 1 } } } },
		});
		expect(inspect).toHaveBeenCalledWith({
			source: "doppler",
			url: "https://h.dev/doppler",
			name: "Secrets",
			options: { x: 1 },
		});
	});
});
