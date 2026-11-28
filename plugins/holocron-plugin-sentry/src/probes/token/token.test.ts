import type { ProbeRow } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import type { SentryClient } from "../../rest.js";
import { tokenProbe } from "./token.js";

type Read = () => Promise<unknown>;

const denied = () => Promise.reject(new ProviderApiError("forbidden", 403));
const broken = () => Promise.reject(new ProviderApiError("boom", 500));
const items =
	(...slugs: string[]) =>
	() =>
		Promise.resolve(slugs.map((slug) => ({ slug })));
const unnamed = () => Promise.resolve([{ id: 1 }]);
const none = () => Promise.resolve([]);

interface Reads {
	orgs?: Read;
	projects?: Read;
	alerts?: Read;
}

async function check(reads: Reads, over: { args?: string[]; org?: string | undefined } = {}) {
	const client = {
		auth: { organizations: vi.fn(reads.orgs ?? none) },
		projects: { list: vi.fn(reads.projects ?? none) },
		workflows: { list: vi.fn(reads.alerts ?? none) },
	} as unknown as SentryClient;
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		org: "org" in over ? over.org : "my-org",
		client: () => client,
		token: () => "general-tok",
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, client, probe };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);
const lines = (rows: ProbeRow[]) => rows.map((r) => `${r.status}:${r.label}`);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets } = await check({});
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["general-tok"]);
	});

	it("reports ok for each read that came back with items, naming them", async () => {
		const { rows } = await check({
			orgs: items("my-org"),
			projects: items("a", "b"),
			alerts: unnamed,
		});
		expect(row(rows, "Organizations: Read")).toMatchObject({ status: "ok", detail: "1 organizations: my-org" });
		expect(row(rows, "Projects: Read")).toMatchObject({ status: "ok", detail: "2 projects: a, b" });
		expect(row(rows, "Alert rules: Read")).toMatchObject({ status: "ok", detail: "1 alert rules" });
	});

	it("shortens a long list of names", async () => {
		const { rows } = await check({ projects: items("a", "b", "c", "d", "e", "f", "g") });
		expect(row(rows, "Projects: Read")?.detail).toBe("7 projects: a, b, c, d, e (+2 more)");
	});

	it("treats a 403 and an empty list as no access, not as a failure", async () => {
		const { rows } = await check({ orgs: denied, projects: none, alerts: denied });
		expect(row(rows, "Organizations: Read")).toMatchObject({ status: "info", detail: "no access (403)" });
		expect(row(rows, "Projects: Read")).toMatchObject({ status: "info" });
		expect(row(rows, "Alert rules: Read")).toMatchObject({ status: "info", detail: "no access (403)" });
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("fails a row for an error that is not about access", async () => {
		const { rows } = await check({ projects: broken });
		expect(row(rows, "Projects: Read")?.status).toBe("fail");
	});

	it("says the projects and alert rules were not checked when there is no org", async () => {
		const { rows, client } = await check({}, { org: undefined });
		expect(row(rows, "projects and alert rules")?.status).toBe("info");
		expect(client.projects.list).not.toHaveBeenCalled();
	});

	describe("checked against a layer", () => {
		const ci = { args: ["--layer", "ci"] };
		const dev = { args: ["--layer", "dev"] };

		it("passes a ci release token that reaches nothing, with each under Should not have", async () => {
			const { rows } = await check({ orgs: denied, projects: denied, alerts: denied }, ci);
			expect(lines(rows)).toEqual([
				"heading:Should not have",
				"ok:Organizations: Read",
				"ok:Projects: Read",
				"ok:Alert rules: Read",
			]);
			expect(row(rows, "Projects: Read")).toEqual({ status: "ok", label: "Projects: Read" });
		});

		it("fails a ci token that can read what it must not", async () => {
			const { rows } = await check({ orgs: items("my-org"), projects: none, alerts: denied }, ci);
			expect(row(rows, "Organizations: Read")).toMatchObject({
				status: "fail",
				detail: "1 organizations: my-org",
			});
			expect(row(rows, "Projects: Read")?.status).toBe("ok");
		});

		it("fails a read that errors under a layer", async () => {
			const { rows } = await check({ orgs: broken, projects: none, alerts: none }, ci);
			expect(row(rows, "Organizations: Read")?.status).toBe("fail");
		});

		it("passes a dev token with the org and projects, and does not judge the alert rules", async () => {
			const { rows } = await check({ orgs: items("my-org"), projects: items("p"), alerts: denied }, dev);
			expect(lines(rows)).toEqual(["heading:Should have", "ok:Organizations: Read", "ok:Projects: Read"]);
		});

		it("fails a dev token that cannot read the projects", async () => {
			const { rows } = await check({ orgs: items("my-org"), projects: denied }, dev);
			expect(row(rows, "Projects: Read")).toMatchObject({ status: "fail", detail: "no access (403)" });
		});

		it("fails the checks it cannot make for want of an org, since the layer needs them", async () => {
			const { rows } = await check({ orgs: items("my-org") }, { ...dev, org: undefined });
			expect(row(rows, "projects and alert rules")?.status).toBe("fail");
		});

		it("only describes a layer with no declared expectations, and says so", async () => {
			const { rows } = await check({ orgs: items("my-org") }, { args: ["--layer", "prod"] });
			expect(row(rows, "prod")?.detail).toContain("no expectations");
			expect(rows.some((r) => r.status === "heading" || r.status === "fail")).toBe(false);
		});
	});

	describe("the declared token the CLI names with --token-name", () => {
		const comlink = "HOLOCRON_SENTRY_COMLINK_TOKEN";

		it("judges the Comlink token against its own expectations, which also need the alert rules", async () => {
			const { rows } = await check(
				{ orgs: items("my-org"), projects: items("p"), alerts: denied },
				{ args: ["--layer", "dev", "--token-name", comlink] }
			);
			expect(lines(rows)).toEqual([
				"heading:Should have",
				"ok:Organizations: Read",
				"ok:Projects: Read",
				"fail:Alert rules: Read",
			]);
		});

		it("passes the Comlink token with all three reads", async () => {
			const { rows } = await check(
				{ orgs: items("my-org"), projects: items("p"), alerts: items("rule") },
				{ args: ["--layer", "local", `--token-name=${comlink}`] }
			);
			expect(rows.some((r) => r.status === "fail")).toBe(false);
		});

		it("judges the general token without the alert rules, and the release token in ci as reaching none", async () => {
			const general = await check(
				{ orgs: items("my-org"), projects: items("p"), alerts: denied },
				{ args: ["--layer", "dev", "--token-name", "HOLOCRON_SENTRY_TOKEN"] }
			);
			expect(lines(general.rows)).toEqual(["heading:Should have", "ok:Organizations: Read", "ok:Projects: Read"]);
			const release = await check(
				{ orgs: denied, projects: denied, alerts: denied },
				{ args: ["--layer", "ci", "--token-name", "HOLOCRON_SENTRY_RELEASE_TOKEN"] }
			);
			expect(release.rows.some((r) => r.status === "fail")).toBe(false);
		});

		it("is only described in a layer where that token has no declared expectations", async () => {
			const { rows } = await check(
				{ orgs: items("my-org") },
				{ args: ["--layer", "ci", "--token-name", comlink] }
			);
			expect(row(rows, "ci")?.detail).toContain("no expectations");
		});
	});
});
