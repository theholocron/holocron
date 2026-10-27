import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createSentryClient } from "../rest.js";
import { SentryErrors } from "./errors.js";

const BASE = "https://sentry.test/api/0";
const ORG = "my-org";

function makeErrors(responses: Parameters<typeof stubFetch>[0], opts: { org?: string; team?: string } = { org: ORG }) {
	const { fetch, calls } = stubFetch(responses);
	const client = createSentryClient({ token: "sntryu_tok", baseUrl: BASE, fetch });
	return { errors: new SentryErrors(() => client, opts), calls };
}

const project = { id: "p1", slug: "my-project", name: "My Project", platform: "node" };
const key = {
	id: "k1",
	label: "Default",
	public: "abc123",
	secret: "secret123",
	dsn: {
		public: "https://abc123@o123.ingest.sentry.io/456",
		secret: "https://abc123:secret123@o123.ingest.sentry.io/456",
	},
};

describe("SentryErrors — org validation", () => {
	it("constructs without an org (the capability activates from env vars)", () => {
		expect(() => makeErrors([], {})).not.toThrow();
	});

	it("whoami returns null (not a throw) when no org is configured — DSN-only ingestion still works", async () => {
		const { errors } = makeErrors([], {});
		expect(await errors.whoami()).toBeNull();
	});

	it("throws from ensureProject when no org is configured", async () => {
		const { errors } = makeErrors([], {});
		const err = await errors.ensureProject({ name: "My Project" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/requires `org`/);
	});
});

describe("SentryErrors.describe", () => {
	it("returns sentry provider with both DSN env keys", async () => {
		const { errors } = makeErrors([]);
		const result = await errors.describe();
		expect(result.provider).toBe("sentry");
		expect(result.envKeys).toEqual(["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]);
	});
});

describe("SentryErrors.whoami", () => {
	it("returns the org slug", async () => {
		const { errors, calls } = makeErrors([{ body: { id: "1", slug: ORG, name: "My Org" } }]);
		const result = await errors.whoami();
		expect(calls[0]?.url).toContain(`/organizations/${ORG}/`);
		expect(result?.org).toBe(ORG);
	});
});

describe("SentryErrors.ensureProject — existing", () => {
	it("returns alreadyExists:true when project is found", async () => {
		const { errors, calls } = makeErrors([
			{ body: project }, // GET /projects/{org}/{slug}/
			{ body: [key] }, // GET /projects/{org}/{slug}/keys/
		]);
		const result = await errors.ensureProject({ name: "My Project" });
		expect(calls[0]?.url).toContain(`/projects/${ORG}/my-project/`);
		expect(result.alreadyExists).toBe(true);
		expect(result.dsn).toBe(key.dsn.public);
	});
});

describe("SentryErrors.ensureProject — create", () => {
	it("creates project when GET returns 404", async () => {
		const { errors, calls } = makeErrors([
			{ status: 404, body: { detail: "The requested resource does not exist" } }, // GET → 404
			{ body: project }, // POST create
			{ body: [key] }, // GET keys
		]);
		const result = await errors.ensureProject({ name: "My Project", platform: "javascript" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain(`/teams/${ORG}/${ORG}/projects/`);
		expect(calls[1]?.body).toMatchObject({ name: "My Project", platform: "javascript" });
		expect(result.alreadyExists).toBe(false);
		expect(result.dsn).toBe(key.dsn.public);
	});

	it("rethrows non-404 errors from the existence check", async () => {
		const { errors } = makeErrors([{ status: 403, body: { detail: "Forbidden" } }]);
		await expect(errors.ensureProject({ name: "My Project" })).rejects.toBeInstanceOf(ProviderApiError);
	});

	it("uses the configured team slug when creating", async () => {
		const { errors, calls } = makeErrors(
			[{ status: 404, body: { detail: "Not Found" } }, { body: project }, { body: [key] }],
			{ org: ORG, team: "backend" }
		);
		await errors.ensureProject({ name: "My Project" });
		expect(calls[1]?.url).toContain(`/teams/${ORG}/backend/projects/`);
	});
});

describe("SentryErrors.ensureRelay", () => {
	const app = {
		name: "Comlink",
		slug: "comlink-1",
		uuid: "u",
		status: "internal",
		scopes: ["event:read"],
		webhookUrl: "https://hook",
		isAlertable: true,
		clientSecret: "shh",
	};
	const input = { name: "Comlink", webhookUrl: "https://hook", projects: ["my-project"], rule: { name: "Rule" } };
	const rule = {
		id: "w1",
		name: "Rule",
		enabled: true,
		environment: null,
		config: { frequency: 5 },
		detectorIds: ["d1"],
		triggers: { logicType: "any-short", conditions: [] },
		actionFilters: [
			{
				logicType: "all",
				conditions: [],
				actions: [{ type: "sentry_app", config: { targetIdentifier: "42" }, data: {} }],
			},
		],
	};

	it("works through the relay client, not the general one", async () => {
		const main = stubFetch([]);
		const relay = stubFetch([
			{ body: [project] },
			{ body: [{ id: "d1", projectId: "p1", name: "x", type: "issue_stream", workflowIds: [] }] },
			{ body: [app] },
			{ body: [{ uuid: "i", status: "installed", app: { uuid: "u", slug: "comlink-1", sentryAppId: 42 } }] },
			{ body: [rule] },
		]);
		const make = (fetch: typeof main.fetch) => createSentryClient({ token: "t", baseUrl: BASE, fetch });
		const errors = new SentryErrors(
			() => make(main.fetch),
			{ org: ORG },
			() => make(relay.fetch)
		);
		expect((await errors.ensureRelay(input)).clientSecret).toBe("shh");
		expect(main.calls).toHaveLength(0);
		expect(relay.calls).toHaveLength(5);
	});

	it("needs an org", async () => {
		const { errors } = makeErrors([], {});
		await expect(errors.ensureRelay(input)).rejects.toThrow(/requires `org`/);
	});
});
