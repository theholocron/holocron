import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import type { SentryClient } from "../rest.js";
import { inspectSentryErrors } from "./inspect-errors.js";

const ORG = "my-org";

const SECRET_KEY = { id: "k", label: "Default", public: "pub", secret: "SECRET", dsn: { public: "p", secret: "s" } };

interface Fakes {
	org?: Error | { slug: string; name: string };
	projects?: Record<string, { id: string; slug: string } | Error>;
	keys?: Record<string, unknown[]>;
	detectors?: Array<{ id: string; projectId: string | null; type: string }>;
	workflows?: Array<{ enabled: boolean; detectorIds: string[] }>;
	alertsError?: Error;
}

function fakeClient(f: Fakes): { client: SentryClient; alerts: SentryClient } {
	const client = {
		auth: {
			getOrg: async () => {
				const org = f.org ?? { slug: ORG, name: "My Org" };
				if (org instanceof Error) throw org;
				return org;
			},
		},
		projects: {
			get: async (_o: string, slug: string) => {
				const found = f.projects?.[slug];
				if (!found) throw new ProviderApiError("nope", 404, undefined);
				if (found instanceof Error) throw found;
				return found;
			},
			keys: async (_o: string, slug: string) => f.keys?.[slug] ?? [SECRET_KEY],
		},
	} as unknown as SentryClient;
	const alerts = {
		workflows: {
			detectors: vi.fn(async () => {
				if (f.alertsError) throw f.alertsError;
				return f.detectors ?? [];
			}),
			list: vi.fn(async () => f.workflows ?? []),
		},
	} as unknown as SentryClient;
	return { client, alerts };
}

const run = (f: Fakes, projects = ["holocron"]) => {
	const { client, alerts } = fakeClient(f);
	return inspectSentryErrors(client, () => alerts, ORG, { projects });
};

describe("inspectSentryErrors", () => {
	it("reports the org, each project's key and its enabled alert rules", async () => {
		const found = await run({
			projects: { holocron: { id: "1", slug: "holocron" } },
			detectors: [{ id: "d1", projectId: "1", type: "issue_stream" }],
			workflows: [
				{ enabled: true, detectorIds: ["d1"] },
				{ enabled: false, detectorIds: ["d1"] },
				{ enabled: true, detectorIds: ["other"] },
			],
		});
		expect(found).toEqual({
			org: { slug: ORG, exists: true, name: "My Org" },
			projects: [{ slug: "holocron", exists: true, hasDsn: true, alertRules: 1 }],
		});
	});

	it("never returns a key or a DSN", async () => {
		const found = await run({ projects: { holocron: { id: "1", slug: "holocron" } } });
		expect(JSON.stringify(found)).not.toContain("SECRET");
	});

	it("counts zero rules for a project with no issue stream detector", async () => {
		const found = await run({ projects: { holocron: { id: "1", slug: "holocron" } } });
		expect(found.projects[0]).toMatchObject({ alertRules: 0 });
	});

	it("reports a project that is missing and a project with no key", async () => {
		const found = await run({ projects: { empty: { id: "2", slug: "empty" } }, keys: { empty: [] } }, [
			"gone",
			"empty",
		]);
		expect(found.projects[0]).toEqual({ slug: "gone", exists: false });
		expect(found.projects[1]).toMatchObject({ slug: "empty", exists: true, hasDsn: false });
	});

	it("reports the org as missing, and every project, , when the org is not found", async () => {
		const found = await run({ org: new ProviderApiError("no", 404, undefined) }, ["a", "b"]);
		expect(found).toEqual({
			org: { slug: ORG, exists: false },
			projects: [
				{ slug: "a", exists: false },
				{ slug: "b", exists: false },
			],
		});
	});

	it("rethrows an org error that is not a 404", async () => {
		const err = await run({ org: new ProviderApiError("denied", 403, undefined) }).catch((e: unknown) => e);
		expect((err as ProviderApiError).status).toBe(403);
	});

	it("rethrows a project error that is not a 404", async () => {
		const err = await run({ projects: { holocron: new ProviderApiError("denied", 401, undefined) } }).catch(
			(e: unknown) => e
		);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("keeps the rest when the alert rules cannot be read, and says why", async () => {
		const found = await run({
			projects: { holocron: { id: "1", slug: "holocron" } },
			alertsError: new Error("403 forbidden"),
		});
		expect(found.projects[0]).toEqual({ slug: "holocron", exists: true, hasDsn: true });
		expect(found.alertsUnreadable).toBe("403 forbidden");
	});

	it("does not ask for alert rules when no project exists", async () => {
		const { client, alerts } = fakeClient({});
		await inspectSentryErrors(client, () => alerts, ORG, { projects: ["gone"] });
		expect(alerts.workflows.detectors).not.toHaveBeenCalled();
	});
});
