import type { Probe, ProbeContext, ProbeRow } from "@theholocron/cli";
import type { SentryApp, SentryWorkflow } from "@theholocron/sentry-client";
import { describe, expect, it, vi } from "vitest";

import type { SentryClient } from "../rest.js";
import { sentryProbes } from "./index.js";
import type { SentryProbeDeps } from "./probe-deps.type.js";

function ctxFor(dryRun = false) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const ctx: ProbeContext = {
		dryRun,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async (_label, fn) => (dryRun ? undefined : fn()),
		cleanup: () => {},
	};
	return { ctx, rows, secrets };
}

const app = (over: Partial<SentryApp> = {}): SentryApp => ({
	name: "Comlink",
	slug: "comlink-1",
	uuid: "u",
	status: "internal",
	scopes: ["event:read"],
	webhookUrl: "https://comlink.example.dev/sentry?token=nope",
	isAlertable: true,
	clientSecret: "do-not-print-me",
	...over,
});

const workflow = (actions: unknown[], over: Partial<SentryWorkflow> = {}): SentryWorkflow =>
	({
		id: "w",
		name: "Errors to Discord (Comlink)",
		enabled: true,
		environment: null,
		config: { frequency: 5 },
		detectorIds: ["d1"],
		triggers: { logicType: "any-short", conditions: [] },
		actionFilters: [{ logicType: "all", conditions: [], actions }],
		...over,
	}) as SentryWorkflow;

function deps(
	over: { apps?: SentryApp[]; workflows?: SentryWorkflow[]; org?: string | undefined } & Partial<SentryProbeDeps> = {}
) {
	const client = {
		sentryApps: { list: vi.fn(async () => over.apps ?? [app()]) },
		workflows: { list: vi.fn(async () => over.workflows ?? []) },
		projects: { keys: vi.fn(async () => [{ dsn: { public: "https://pubkey@o1.ingest.sentry.io/4242" } }]) },
	};
	const d: SentryProbeDeps = {
		org: "org" in over ? over.org : "my-org",
		client: () => client as unknown as SentryClient,
		...(over.env ? { env: over.env } : {}),
		...(over.fetch ? { fetch: over.fetch } : {}),
	};
	return { d, client };
}

const probe = (d: SentryProbeDeps, name: string): Probe => sentryProbes(d)[name]!;

describe("probe sentry integrations", () => {
	it("describes each integration and marks the secret without printing it", async () => {
		const { ctx, rows, secrets } = ctxFor();
		await probe(deps().d, "integrations").run(ctx);
		expect(secrets).toEqual(["do-not-print-me"]);
		expect(rows[0]).toMatchObject({ status: "ok", label: "Comlink (comlink-1)" });
		const detail = rows[0]!.detail!;
		expect(detail).toContain("scopes: event:read");
		expect(detail).toContain("alert action: on");
		expect(detail).toContain("webhook: comlink.example.dev/sentry");
		expect(detail).toContain("secret visible: yes");
		expect(detail).not.toMatch(/do-not-print-me|token=nope/);
	});

	it("says when the secret is hidden, there is no webhook, or there are none", async () => {
		const a = deps({ apps: [app({ clientSecret: undefined, webhookUrl: null, scopes: [], isAlertable: false })] });
		const first = ctxFor();
		await probe(a.d, "integrations").run(first.ctx);
		expect(first.rows[0]!.detail).toBe(
			"scopes: none | alert action: off | webhook: no webhook | secret visible: no"
		);
		const bad = ctxFor();
		await probe(deps({ apps: [app({ webhookUrl: "not a url" })] }).d, "integrations").run(bad.ctx);
		expect(bad.rows[0]!.detail).toContain("an unreadable URL");
		const none = ctxFor();
		await probe(deps({ apps: [] }).d, "integrations").run(none.ctx);
		expect(none.rows[0]).toMatchObject({ status: "info", label: "no custom integrations" });
	});

	it("needs an org", async () => {
		await expect(probe(deps({ org: undefined }).d, "integrations").run(ctxFor().ctx)).rejects.toThrow(/org/);
	});
});

describe("probe sentry rules", () => {
	const webhook = (slug: string) => ({
		type: "webhook",
		config: { targetType: null, targetIdentifier: slug },
		data: {},
	});

	it("is ok for the action setup writes: a webhook naming an alertable integration", async () => {
		const { ctx, rows } = ctxFor();
		await probe(deps({ workflows: [workflow([webhook("comlink-1")])] }).d, "rules").run(ctx);
		expect(rows[0]).toMatchObject({ status: "ok", label: "Errors to Discord (Comlink)" });
		expect(rows[0]!.detail).toBe("enabled | detectors: 1 | actions: webhook comlink-1");
	});

	it("fails a rule that is off, that uses the old sentry_app action, or that names something that is not an integration", async () => {
		const old = { type: "sentry_app", config: { targetType: "sentry_app", targetIdentifier: "42" }, data: {} };
		const { ctx, rows } = ctxFor();
		await probe(
			deps({
				workflows: [
					workflow([old]),
					workflow([webhook("gone")], { name: "b" }),
					workflow([{ type: "email", config: { targetType: "issue_owners" }, data: {} }], {
						name: "c",
						enabled: false,
					}),
				],
			}).d,
			"rules"
		).run(ctx);
		expect(rows.map((r) => r.status)).toEqual(["fail", "fail", "fail"]);
		expect(rows[0]!.detail).toContain("shows as an unknown integration");
		expect(rows[1]!.detail).toContain("webhook gone is not an alertable integration");
		expect(rows[2]!.detail).toContain("DISABLED");
		expect(rows[2]!.detail).toContain("email issue_owners");
	});

	it("says none for a rule that has no actions", async () => {
		const { ctx, rows } = ctxFor();
		await probe(deps({ workflows: [workflow([])] }).d, "rules").run(ctx);
		expect(rows[0]).toMatchObject({ status: "ok", detail: "enabled | detectors: 1 | actions: none" });
	});

	it("handles an action with no target, and no rules", async () => {
		const bare = ctxFor();
		await probe(deps({ workflows: [workflow([{ type: "email", config: {}, data: {} }])] }).d, "rules").run(
			bare.ctx
		);
		expect(bare.rows[0]!.detail).toContain("actions: email");
		const none = ctxFor();
		await probe(deps().d, "rules").run(none.ctx);
		expect(none.rows[0]).toMatchObject({ status: "info", label: "no alert rules" });
	});
});

describe("probe sentry send-error", () => {
	const okFetch = () =>
		vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status: 200 }));

	it("sends an envelope to the DSN in SENTRY_DSN", async () => {
		const fetch = okFetch();
		const { ctx, rows, secrets } = ctxFor();
		await probe(
			deps({ env: { SENTRY_DSN: "https://pubkey@o1.ingest.sentry.io/4242" }, fetch }).d,
			"send-error"
		).run(ctx);
		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe(
			"https://o1.ingest.sentry.io/api/4242/envelope/?sentry_version=7&sentry_key=pubkey&sentry_client=holocron-probe/1"
		);
		expect(String(init?.body)).toContain("HolocronProbeError");
		expect(secrets).toContain("pubkey");
		expect(rows[0]).toMatchObject({ status: "ok", label: "sent HolocronProbeError" });
	});

	it("reads SENTRY_DSN from the environment and sends with the global fetch when not given either", async () => {
		vi.stubEnv("SENTRY_DSN", "https://pubkey@o1.ingest.sentry.io/4242");
		const fetch = okFetch();
		vi.stubGlobal("fetch", fetch);
		try {
			await probe(deps().d, "send-error").run(ctxFor().ctx);
			expect(String(fetch.mock.calls[0]![0])).toContain("o1.ingest.sentry.io/api/4242/envelope/");
		} finally {
			vi.unstubAllGlobals();
			vi.unstubAllEnvs();
		}
	});

	it("takes the DSN from a project's client key when only the project is named", async () => {
		const fetch = okFetch();
		const { d, client } = deps({ env: { HOLOCRON_SENTRY_PROBE_PROJECT: "holocron-cli" }, fetch });
		await probe(d, "send-error").run(ctxFor().ctx);
		expect(client.projects.keys).toHaveBeenCalledWith("my-org", "holocron-cli");
		expect(String(fetch.mock.calls[0]![0])).toContain("/api/4242/envelope/");
	});

	it("sends nothing on a dry run", async () => {
		const fetch = okFetch();
		const { ctx, rows } = ctxFor(true);
		await probe(
			deps({ env: { SENTRY_DSN: "https://pubkey@o1.ingest.sentry.io/4242" }, fetch }).d,
			"send-error"
		).run(ctx);
		expect(fetch).not.toHaveBeenCalled();
		expect(rows).toEqual([]);
	});

	it("says what is missing, and what Sentry answered", async () => {
		await expect(probe(deps({ env: {} }).d, "send-error").run(ctxFor().ctx)).rejects.toThrow(/SENTRY_DSN/);
		const none = deps({ env: { HOLOCRON_SENTRY_PROBE_PROJECT: "p" } });
		none.client.projects.keys.mockResolvedValue([]);
		await expect(probe(none.d, "send-error").run(ctxFor().ctx)).rejects.toThrow(/no client key/);
		const rejected = vi.fn(async (_url: string | URL | Request) => new Response("no", { status: 403 }));
		await expect(
			probe(
				deps({ env: { SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, fetch: rejected }).d,
				"send-error"
			).run(ctxFor().ctx)
		).rejects.toThrow(/403/);
	});
});

describe("sentryProbes", () => {
	it("offers the three probes, and only send-error writes", () => {
		const probes = sentryProbes(deps().d);
		expect(Object.keys(probes).sort()).toEqual(["integrations", "rules", "send-error"]);
		expect(
			Object.entries(probes)
				.filter(([, p]) => p.writes)
				.map(([n]) => n)
		).toEqual(["send-error"]);
	});
});
