import { afterEach, describe, expect, it, vi } from "vitest";

import {
	MissingTokenError,
	type NotificationsLayout,
	type ServerInspection,
	type WorkerScriptState,
} from "../../plugin/index.js";
import { relayChecks } from "./relay-checks.js";
import type { RelayChecksInput } from "./relay-checks.type.js";

const SENTINEL = "sentinel-secret-value";
const layout = (over: Partial<NotificationsLayout> = {}, feed: unknown = true): NotificationsLayout => ({
	relay: { host: "comlink.example.com" },
	categories: [
		{ name: "ALERTS", channels: [{ name: "errors", feeds: { errors: feed as never } }, { name: "plain" }] },
	],
	...over,
});
const server = (over: Partial<ServerInspection["channels"][number]> = {}): ServerInspection => ({
	categories: ["ALERTS"],
	channels: [{ name: "errors", category: "ALERTS", webhooks: ["Sentry"], webhookAvatars: ["Sentry"], ...over }],
	roles: [],
});
const GOOD: WorkerScriptState = {
	exists: true,
	routes: ["comlink.example.com/*"],
	bindingNames: ["COMLINK_SENTRY_WEBHOOK", "COMLINK_SENTRY_SECRET"],
};
const reply = (status: number) => vi.fn(async () => ({ status, text: async () => SENTINEL }) as unknown as Response);
const workers = (state: WorkerScriptState | Error | "none" = GOOD) => ({
	providerName: "cloudflare",
	...(state === "none"
		? {}
		: {
				inspectScript: vi.fn(async () => {
					if (state instanceof Error) throw state;
					return state;
				}),
			}),
});
const run = (over: Partial<RelayChecksInput> = {}) =>
	relayChecks({
		layout: layout(),
		errors: { providerName: "sentry" },
		errorsMissingReason: "no `errors` provider is configured",
		workers: workers(),
		workersMissingReason: "no `workers` provider is configured",
		found: server(),
		fetch: reply(401) as unknown as typeof fetch,
		...over,
	});
const row = (rows: Awaited<ReturnType<typeof run>>, id: string) => rows.find((r) => r.id === id)!;
const IDS = ["relay-answers", "relay-worker", "relay-bindings", "relay-feed-webhook"];

afterEach(() => vi.unstubAllGlobals());

describe("relayChecks", () => {
	it("adds no rows without a relay, a relay host or a channel fed by the error tracker", async () => {
		expect(await run({ layout: layout({ relay: undefined }) })).toEqual([]);
		expect(await run({ layout: layout({ relay: { host: "" } }) })).toEqual([]);
		expect(await run({ layout: { relay: { host: "h.example.com" }, categories: [{ name: "A" }] } })).toEqual([]);
		expect(await run({ layout: { relay: { host: "h.example.com" } } })).toEqual([]);
	});

	it("passes every step when the Worker, its route, its bindings and its feed webhook are as declared", async () => {
		const fetchStub = reply(401);
		const rows = await run({ fetch: fetchStub as unknown as typeof fetch });
		expect(rows.map((r) => [r.id, r.status])).toEqual(IDS.map((id) => [id, "pass"]));
		expect(fetchStub).toHaveBeenCalledWith("https://comlink.example.com/sentry", {
			method: "POST",
			redirect: "manual",
			signal: expect.any(AbortSignal),
		});
	});

	it("finds the fed channel past a category with no channels", async () => {
		const withEmpty = layout();
		withEmpty.categories = [{ name: "EMPTY" }, ...withEmpty.categories!];
		const rows = await run({ layout: withEmpty });
		expect(row(rows, "relay-feed-webhook").status).toBe("pass");
	});

	it("skips every step, with the reason, when there is no errors provider", async () => {
		const rows = await run({ errors: undefined, errorsMissingReason: "sentry failed to load (no token)" });
		expect(rows.map((r) => [r.id, r.status, r.detail])).toEqual(
			IDS.map((id) => [id, "skip", "sentry failed to load (no token)"])
		);
	});

	describe("the Worker answers", () => {
		it("fails on 404 (not deployed or no route) and on any other status", async () => {
			const gone = await run({ fetch: reply(404) as unknown as typeof fetch });
			expect(row(gone, "relay-answers").problems).toEqual([
				"https://comlink.example.com/sentry answered 404: the Worker is not deployed or has no route",
			]);
			const open = await run({ fetch: reply(200) as unknown as typeof fetch });
			expect(row(open, "relay-answers").problems).toEqual([
				"https://comlink.example.com/sentry answered 200, expected 401 for an unsigned request",
			]);
		});

		it("fails on a timeout and on a network error, with no retry", async () => {
			const slow = vi.fn(async () => {
				throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
			});
			const timedOut = await run({ fetch: slow as unknown as typeof fetch });
			expect(row(timedOut, "relay-answers").problems).toEqual([
				"https://comlink.example.com/sentry gave no answer within 5s",
			]);
			expect(slow).toHaveBeenCalledTimes(1);
			const down = vi.fn(async () => {
				throw new TypeError("fetch failed");
			});
			const failed = await run({ fetch: down as unknown as typeof fetch });
			expect(row(failed, "relay-answers").problems).toEqual([
				"https://comlink.example.com/sentry could not be reached: fetch failed",
			]);
			const odd = vi.fn(async () => {
				throw "refused";
			});
			expect(row(await run({ fetch: odd as unknown as typeof fetch }), "relay-answers").problems[0]).toContain(
				"refused"
			);
		});

		it("uses the global fetch when none is injected", async () => {
			const global = reply(401);
			vi.stubGlobal("fetch", global);
			const rows = await run({ fetch: undefined });
			expect(row(rows, "relay-answers").status).toBe("pass");
			expect(global).toHaveBeenCalledTimes(1);
		});
	});

	describe("the Worker and its bindings", () => {
		it("fails for a Worker that is not deployed, and does not check its bindings", async () => {
			const rows = await run({ workers: workers({ exists: false, routes: [], bindingNames: [] }) });
			expect(row(rows, "relay-worker").problems).toEqual(["no Worker named comlink"]);
			expect(row(rows, "relay-bindings")).toMatchObject({
				status: "skip",
				detail: "not checked: no Worker named comlink",
			});
		});

		it("fails for a missing route and for each binding that is not bound, by name only", async () => {
			const rows = await run({
				workers: workers({
					exists: true,
					routes: ["other.example.com/*"],
					bindingNames: ["comlink_sentry_webhook"],
				}),
			});
			expect(row(rows, "relay-worker").problems).toEqual(["comlink has no route comlink.example.com/*"]);
			expect(row(rows, "relay-bindings").problems).toEqual(["COMLINK_SENTRY_SECRET: not bound"]);
		});

		it("uses the script name the layout gives", async () => {
			const w = workers();
			await run({ layout: layout({ relay: { host: "comlink.example.com", script: "relay" } }), workers: w });
			expect(w.inspectScript).toHaveBeenCalledWith("relay", "comlink.example.com");
		});

		it("skips both when there is no workers provider, it cannot read, or the token is missing", async () => {
			const none = await run({
				workers: undefined,
				workersMissingReason: "cloudflare failed to load (no token)",
			});
			expect(none.map((r) => r.status)).toEqual(["pass", "skip", "skip", "pass"]);
			expect(row(none, "relay-worker").detail).toBe("cloudflare failed to load (no token)");
			const cannot = await run({ workers: workers("none") });
			expect(row(cannot, "relay-bindings").detail).toBe("the `cloudflare` provider cannot read its Workers");
			const token = await run({ workers: workers(new MissingTokenError("no Cloudflare token set")) });
			expect(token.map((r) => r.status)).toEqual(["pass", "skip", "skip", "pass"]);
			expect(row(token, "relay-worker").detail).toBe("no Cloudflare token set");
			const authError = Object.assign(new Error("no Cloudflare token found"), { name: "AuthError" });
			const fromPlugin = await run({ workers: workers(authError) });
			expect(row(fromPlugin, "relay-bindings")).toMatchObject({
				status: "skip",
				detail: "no Cloudflare token found",
			});
		});

		it("reports any other read error as a failure", async () => {
			const rows = await run({ workers: workers(new Error("zone not found")) });
			expect(row(rows, "relay-worker").problems).toEqual(["zone not found"]);
			expect(row(rows, "relay-bindings")).toMatchObject({
				status: "skip",
				detail: "not checked: could not read the Worker",
			});
		});
	});

	describe("the error feed webhook", () => {
		it("fails when the channel, the webhook or its picture is missing, or its webhooks could not be listed", async () => {
			const none = await run({ found: { ...server(), channels: [] } });
			expect(row(none, "relay-feed-webhook").problems).toEqual(["#errors: no channel to hold the feed webhook"]);
			const noHook = await run({ found: server({ webhooks: [], webhookAvatars: [] }) });
			expect(row(noHook, "relay-feed-webhook").problems).toEqual(["#errors: no webhook named Sentry"]);
			const noPicture = await run({
				layout: layout({ webhookAvatar: "https://example.com/a.png" }),
				found: server({ webhookAvatars: undefined }),
			});
			expect(row(noPicture, "relay-feed-webhook").problems).toEqual(["#errors: webhook Sentry has no picture"]);
			const pictured = await run({ layout: layout({ webhookAvatar: "https://example.com/a.png" }) });
			expect(row(pictured, "relay-feed-webhook").status).toBe("pass");
			const noList = await run({ found: server({ webhooks: [], webhooksError: "403" }) });
			expect(row(noList, "relay-feed-webhook").problems).toEqual(["#errors: could not list its webhooks (403)"]);
		});

		it("expects a picture only when the layout gives one, uses the webhook name the layout gives, and skips when the server could not be read", async () => {
			expect(row(await run({ found: server({ webhookAvatars: undefined }) }), "relay-feed-webhook").status).toBe(
				"pass"
			);
			const named = await run({
				layout: layout({}, { webhook: "Errors" }),
				found: server({ webhooks: ["Errors"] }),
			});
			expect(row(named, "relay-feed-webhook").status).toBe("pass");
			const unread = await run({ found: undefined });
			expect(row(unread, "relay-feed-webhook")).toMatchObject({
				status: "skip",
				detail: "not checked: could not read the server",
			});
		});
	});

	it("never puts anything the Worker or the provider returns beyond the status and the binding names in a row", async () => {
		const rows = await run({ fetch: reply(500) as unknown as typeof fetch });
		expect(JSON.stringify(rows)).not.toContain(SENTINEL);
	});
});
