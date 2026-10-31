import { describe, expect, it, vi } from "vitest";

import { MissingTokenError, type NotificationsLayout, type RelayState } from "../../plugin/index.js";
import { sentryRelayChecks } from "./sentry-relay-checks.js";
import type { SentryRelayChecksInput } from "./sentry-relay-checks.type.js";

const layout = (tracker: unknown = { projects: ["holocron-cli"] }, feed = true): NotificationsLayout => ({
	relay: { host: "comlink.example.com", errors: tracker as never },
	categories: feed ? [{ name: "ALERTS", channels: [{ name: "errors", feeds: { errors: true } }] }] : [{ name: "A" }],
});
const GOOD: RelayState = {
	integration: { webhookUrl: "https://comlink.example.com/sentry", alertAction: true },
	rules: [{ project: "holocron-cli", enabled: true, sends: true }],
};
const provider = (state: RelayState | Error | "none" = GOOD) => ({
	providerName: "sentry",
	...(state === "none"
		? {}
		: {
				inspectRelay: vi.fn(async () => {
					if (state instanceof Error) throw state;
					return state;
				}),
			}),
});
const run = (over: Partial<SentryRelayChecksInput> = {}) =>
	sentryRelayChecks({
		layout: layout(),
		errors: provider(),
		errorsMissingReason: "no `errors` provider is configured",
		...over,
	});
const row = (rows: Awaited<ReturnType<typeof run>>, id: string) => rows.find((r) => r.id === id)!;

describe("sentryRelayChecks", () => {
	it("adds no rows unless the layout declares relay.errors on a channel fed by the tracker", async () => {
		expect(await run({ layout: layout(null) })).toEqual([]);
		expect(await run({ layout: layout({ projects: ["p"] }, false) })).toEqual([]);
		expect(await run({ layout: { categories: [] } })).toEqual([]);
	});

	it("passes both steps when the integration and the rule are as declared, and asks with the layout's names", async () => {
		const errors = provider();
		const rows = await run({
			layout: layout({ projects: ["holocron-cli"], integration: "Relay", rule: "Alerts" }),
			errors,
		});
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["relay-integration", "pass"],
			["relay-rule", "pass"],
		]);
		expect(errors.inspectRelay).toHaveBeenCalledWith({
			name: "Relay",
			projects: ["holocron-cli"],
			rule: { name: "Alerts" },
		});
		expect((await run({ errors })).length).toBe(2);
		expect(errors.inspectRelay).toHaveBeenLastCalledWith({
			name: "Comlink",
			projects: ["holocron-cli"],
			rule: { name: "Errors to Discord (Comlink)" },
		});
	});

	it("skips both steps, with the reason, when there is no errors provider, it cannot read, or the token is missing", async () => {
		const none = await run({ errors: undefined, errorsMissingReason: "sentry failed to load (no token)" });
		expect(none.map((r) => [r.status, r.detail])).toEqual([
			["skip", "sentry failed to load (no token)"],
			["skip", "sentry failed to load (no token)"],
		]);
		const cannot = await run({ errors: provider("none") });
		expect(cannot.map((r) => r.detail)).toEqual([
			"the `sentry` provider cannot read its relay",
			"the `sentry` provider cannot read its relay",
		]);
		const token = await run({ errors: provider(new MissingTokenError("no Sentry token set")) });
		expect(token.map((r) => [r.status, r.detail])).toEqual([
			["skip", "no Sentry token set"],
			["skip", "no Sentry token set"],
		]);
		const authError = Object.assign(new Error("no Sentry token found"), { name: "AuthError" });
		const fromPlugin = await run({ errors: provider(authError) });
		expect(fromPlugin.map((r) => r.status)).toEqual(["skip", "skip"]);
	});

	it("fails the integration step on any other read error and does not check the rule", async () => {
		const rows = await run({ errors: provider(new Error("403 forbidden")) });
		expect(row(rows, "relay-integration").problems).toEqual(["403 forbidden"]);
		expect(row(rows, "relay-rule")).toMatchObject({
			status: "skip",
			detail: "not checked: could not read the integration",
		});
	});

	describe("the integration", () => {
		it("fails when it is missing, posts somewhere else, or is not an alert action", async () => {
			const missing = await run({ errors: provider({ rules: [] }) });
			expect(row(missing, "relay-integration").problems).toEqual(["no integration named Comlink"]);
			const wrong = await run({
				errors: provider({
					...GOOD,
					integration: { webhookUrl: "https://old.example.com/sentry", alertAction: false },
				}),
			});
			expect(row(wrong, "relay-integration").problems).toEqual([
				"Comlink posts to https://old.example.com/sentry, not https://comlink.example.com/sentry",
				"Comlink is not offered as an alert action",
			]);
		});

		it("fails for an integration with no webhook URL", async () => {
			const rows = await run({
				errors: provider({ ...GOOD, integration: { webhookUrl: null, alertAction: true } }),
			});
			expect(row(rows, "relay-integration").problems).toEqual([
				"Comlink posts to nowhere, not https://comlink.example.com/sentry",
			]);
		});

		it("ignores a trailing slash on the URL", async () => {
			const rows = await run({
				errors: provider({
					...GOOD,
					integration: { webhookUrl: "https://comlink.example.com/sentry/", alertAction: true },
				}),
			});
			expect(row(rows, "relay-integration").status).toBe("pass");
		});
	});

	describe("the rule", () => {
		it("fails for a project with no rule, a disabled rule, and a rule that does not send through the integration", async () => {
			const rows = await run({
				layout: layout({ projects: ["a", "b", "c", "d"] }),
				errors: provider({
					...GOOD,
					rules: [
						{ project: "a", enabled: true, sends: true },
						{ project: "b", enabled: false, sends: true },
						{ project: "c", enabled: true, sends: false },
					],
				}),
			});
			expect(row(rows, "relay-rule").problems).toEqual([
				"b: Errors to Discord (Comlink) is disabled",
				"c: Errors to Discord (Comlink) does not send through Comlink",
				"d: no rule named Errors to Discord (Comlink) on it",
			]);
			expect(row(rows, "relay-rule").detail).toBe("3 problem(s)");
		});

		it("passes with a note when no project is declared", async () => {
			const rows = await run({ layout: layout({ projects: [] }) });
			expect(row(rows, "relay-rule")).toMatchObject({ status: "pass", detail: "none declared" });
		});
	});
});
