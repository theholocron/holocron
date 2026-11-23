import { stripVTControlCharacters } from "node:util";

import type { GitHubAppDelivery } from "@theholocron/github-client";
import { NonInteractiveError } from "@theholocron/kyber/ui";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../../config/index.js";
import { fakeLoader } from "../../migrate/migrate.testing.js";
import { runRedeliverWebhooks } from "./run-redeliver-webhooks.js";
import type { DeliveryApi, RunRedeliverWebhooksInput } from "./run-redeliver-webhooks.type.js";

// Put together from parts so the source holds no PEM block for a secret scanner to take for a real key.
const KEY = ["-----BEGIN", "RSA PRIVATE KEY-----\nSECRETKEYBODY\n-----END", "RSA PRIVATE KEY-----\n"].join(" ");
const NOW = Date.parse("2026-11-22T12:00:00Z");
const INSTANCES = [
	{ name: "Sentinel", manifest: "m.json", environment: "Sentinel" },
	{ name: "Sentinel (dev)", manifest: "m.json", environment: "Sentinel dev" },
];

const delivery = (
	id: number,
	guid: string,
	at: string,
	statusCode: number,
	over: Partial<GitHubAppDelivery> = {}
): GitHubAppDelivery => ({
	id,
	guid,
	deliveredAt: at,
	redelivery: false,
	statusCode,
	status: statusCode === 200 ? "OK" : statusCode === 0 ? "" : `Invalid HTTP Response: ${statusCode}`,
	event: "check_run",
	action: "completed",
	installationId: 7,
	...over,
});

function setup(
	deliveries: Record<string, GitHubAppDelivery[] | Error> = {},
	extra: Partial<RunRedeliverWebhooksInput> = {}
) {
	const lines: string[] = [];
	const redeliver = vi.fn(async (_creds: unknown, _id: number) => undefined);
	const api: DeliveryApi = {
		listAppDeliveries: vi.fn(async (creds) => {
			const found = deliveries[creds.appId] ?? [];
			if (found instanceof Error) throw found;
			return found;
		}),
		redeliverAppDelivery: redeliver as DeliveryApi["redeliverAppDelivery"],
	};
	const vault = {
		providerName: "1password",
		readEnvironment: async (environment: string) =>
			environment === "Sentinel dev"
				? { GITHUB_APP_ID: "dev", GITHUB_APP_PRIVATE_KEY: KEY }
				: { GITHUB_APP_ID: "prod", GITHUB_APP_PRIVATE_KEY: KEY },
	};
	const input: RunRedeliverWebhooksInput = {
		loaded: {
			resolved: resolveConfig({ name: "demo", org: "acme", providers: {}, githubApps: INSTANCES } as never),
			filepath: "/tmp/x",
		},
		context: { repoRoot: "/tmp/test" },
		loader: fakeLoader({ vault }),
		api,
		print: (line) => lines.push(stripVTControlCharacters(line)),
		now: () => NOW,
		interactive: true,
		confirm: async () => true,
		...extra,
	};
	return { input, lines, redeliver, api, text: () => lines.join("\n") };
}

describe("runRedeliverWebhooks", () => {
	it("redelivers each failed delivery once, oldest first, after one question, and says so", async () => {
		const { input, redeliver, text } = setup({
			prod: [
				delivery(3, "c", "2026-11-22T11:00:00Z", 500),
				delivery(2, "b", "2026-11-22T10:00:00Z", 0, { action: null, event: "status" }),
				delivery(1, "a", "2026-11-22T09:00:00Z", 200),
			],
		});
		const confirm = vi.fn(async () => true);
		const report = await runRedeliverWebhooks({ ...input, confirm, app: "Sentinel" });
		expect(report.status).toBe("ok");
		expect(redeliver.mock.calls.map((c) => c[1])).toEqual([2, 3]);
		expect(confirm).toHaveBeenCalledWith("Redeliver 2 failed webhook deliveries?");
		expect(text()).toContain("redelivered status of 2026-11-22T10:00:00Z (status 0)");
		expect(text()).toContain(
			"redelivered check_run.completed of 2026-11-22T11:00:00Z (Invalid HTTP Response: 500)"
		);
	});

	it("asks for the delivery log since the span, one day by default", async () => {
		const { input, api } = setup({ prod: [], dev: [] });
		await runRedeliverWebhooks(input);
		expect(api.listAppDeliveries).toHaveBeenCalledWith(expect.objectContaining({ appId: "prod" }), {
			since: "2026-11-21T12:00:00.000Z",
		});
		const again = setup({ prod: [], dev: [] });
		await runRedeliverWebhooks({ ...again.input, since: "2h" });
		expect(again.api.listAppDeliveries).toHaveBeenCalledWith(expect.anything(), {
			since: "2026-11-22T10:00:00.000Z",
		});
	});

	it("says nothing needs redelivering when no delivery failed, and asks nothing", async () => {
		const { input, redeliver, text } = setup({ prod: [delivery(1, "a", "2026-11-22T09:00:00Z", 200)], dev: [] });
		const confirm = vi.fn(async () => true);
		const report = await runRedeliverWebhooks({ ...input, confirm });
		expect(report.status).toBe("ok");
		expect(text()).toContain("no failed deliveries since");
		expect(confirm).not.toHaveBeenCalled();
		expect(redeliver).not.toHaveBeenCalled();
	});

	it("on --dry-run lists what it would redeliver and calls nothing that writes", async () => {
		const { input, redeliver, text } = setup({ prod: [delivery(3, "c", "2026-11-22T11:00:00Z", 500)], dev: [] });
		const report = await runRedeliverWebhooks({
			...input,
			context: { repoRoot: "/tmp/test", dryRun: true },
			confirm: undefined,
			interactive: false,
		});
		expect(report.status).toBe("ok");
		expect(text()).toContain("(dry-run)");
		expect(text()).toContain("would redeliver check_run.completed of 2026-11-22T11:00:00Z");
		expect(redeliver).not.toHaveBeenCalled();
	});

	it("needs --yes without a terminal, and with --yes redelivers without asking", async () => {
		const { input, redeliver } = setup({ prod: [delivery(3, "c", "2026-11-22T11:00:00Z", 500)], dev: [] });
		await expect(runRedeliverWebhooks({ ...input, interactive: false, confirm: undefined })).rejects.toBeInstanceOf(
			NonInteractiveError
		);
		expect(redeliver).not.toHaveBeenCalled();
		const confirm = vi.fn(async () => true);
		await runRedeliverWebhooks({ ...input, interactive: false, confirm, yes: true });
		expect(confirm).not.toHaveBeenCalled();
		expect(redeliver).toHaveBeenCalledTimes(1);
	});

	it("redelivers nothing when the question is answered no", async () => {
		const { input, redeliver, text } = setup({ prod: [delivery(3, "c", "2026-11-22T11:00:00Z", 500)], dev: [] });
		const report = await runRedeliverWebhooks({ ...input, confirm: async () => false });
		expect(report.status).toBe("ok");
		expect(text()).toContain("not confirmed; nothing was redelivered");
		expect(redeliver).not.toHaveBeenCalled();
	});

	it("goes on past a redelivery GitHub refuses, fails the run, and keeps the key out of the row", async () => {
		const { input, redeliver, text } = setup({
			prod: [delivery(1, "a", "2026-11-22T09:00:00Z", 500), delivery(2, "b", "2026-11-22T10:00:00Z", 500)],
			dev: [],
		});
		redeliver.mockRejectedValueOnce(new Error(`422 too old ${KEY}`));
		const report = await runRedeliverWebhooks(input);
		expect(report.status).toBe("fail");
		expect(redeliver).toHaveBeenCalledTimes(2);
		expect(text()).toContain("422 too old");
		expect(`${text()}${JSON.stringify(report.rows)}`).not.toContain("SECRETKEYBODY");
	});

	it("reads the clock itself when none is given, and a config that declares no App as having none", async () => {
		const { input } = setup({ prod: [], dev: [] });
		const clocked = await runRedeliverWebhooks({ ...input, now: undefined, since: "2026-11-21" });
		expect(clocked.status).toBe("ok");
		const none = setup();
		const resolved = { ...none.input.loaded.resolved } as { githubApps?: unknown };
		delete resolved.githubApps;
		none.input.loaded = { ...none.input.loaded, resolved: resolved as never };
		expect((await runRedeliverWebhooks(none.input)).rows[0]?.status).toBe("skip");
	});

	it("says `delivery` for one", async () => {
		const { input, confirm } = (() => {
			const s = setup({ prod: [delivery(3, "c", "2026-11-22T11:00:00Z", 500)], dev: [] });
			const confirm = vi.fn(async () => true);
			s.input.confirm = confirm;
			return { input: s.input, confirm };
		})();
		await runRedeliverWebhooks(input);
		expect(confirm).toHaveBeenCalledWith("Redeliver 1 failed webhook delivery?");
	});

	it("reads each instance, and only the one --app names", async () => {
		const both = setup({ prod: [], dev: [] });
		await runRedeliverWebhooks(both.input);
		expect(both.api.listAppDeliveries).toHaveBeenCalledTimes(2);
		const one = setup({ prod: [], dev: [] });
		await runRedeliverWebhooks({ ...one.input, app: "Sentinel (dev)" });
		expect(one.api.listAppDeliveries).toHaveBeenCalledTimes(1);
	});

	it("is a failing row for a name no instance has, a failing row for a log that cannot be read, a skip for credentials it cannot", async () => {
		const unknown = await runRedeliverWebhooks({ ...setup().input, app: "Nope" });
		expect(unknown.rows[0]).toMatchObject({
			status: "fail",
			detail: expect.stringContaining('"Nope" (Sentinel, Sentinel (dev))'),
		});
		const failing = setup({ prod: new Error(`403 ${KEY}`), dev: [] });
		const report = await runRedeliverWebhooks(failing.input);
		expect(report.rows.find((r) => r.id === "Sentinel")).toMatchObject({
			status: "fail",
			detail: expect.stringContaining("cannot read the delivery log: 403"),
		});
		expect(`${failing.text()}`).not.toContain("SECRETKEYBODY");
		const noVault = setup({}, { loader: fakeLoader({}) });
		const skipped = await runRedeliverWebhooks(noVault.input);
		expect(skipped.rows.every((r) => r.status === "skip")).toBe(true);
		expect(skipped.rows[0]?.detail).toContain("needs a `vault` provider");
	});

	it("is a skip when no App is declared, and a failure for a --since it cannot read", async () => {
		const bare = setup();
		bare.input.loaded = { ...bare.input.loaded, resolved: { ...bare.input.loaded.resolved, githubApps: [] } };
		expect((await runRedeliverWebhooks(bare.input)).rows[0]).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("no `githubApps`"),
		});
		const bad = await runRedeliverWebhooks({ ...setup().input, since: "yesterday-ish" });
		expect(bad.status).toBe("fail");
		expect(bad.rows[0]?.detail).toContain('--since "yesterday-ish" is not a date or a span');
		expect(bad.rows[0]?.detail).not.toContain("sync issues");
	});
});
