import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { SentryObservability } from "../capabilities/observability.js";
import { createSentryClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";
const ORG = "my-org";

function makeObs(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createSentryClient({ token: "sntryu_tok", baseUrl: BASE, fetch });
	return { obs: new SentryObservability(client, { org: ORG }), calls };
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

describe("SentryObservability.describe", () => {
	it("returns sentry provider with both DSN env keys", async () => {
		const { obs } = makeObs([]);
		const result = await obs.describe();
		expect(result.provider).toBe("sentry");
		expect(result.envKeys).toEqual(["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]);
	});
});

describe("SentryObservability.whoami", () => {
	it("returns the org slug", async () => {
		const { obs, calls } = makeObs([{ body: { id: "1", slug: ORG, name: "My Org" } }]);
		const result = await obs.whoami();
		expect(calls[0]?.url).toContain(`/organizations/${ORG}/`);
		expect(result.org).toBe(ORG);
	});
});

describe("SentryObservability.ensureProject — existing", () => {
	it("returns alreadyExists:true when project is found", async () => {
		const { obs, calls } = makeObs([
			{ body: project }, // GET /projects/{org}/{slug}/
			{ body: [key] }, // GET /projects/{org}/{slug}/keys/
		]);
		const result = await obs.ensureProject({ name: "My Project" });
		expect(calls[0]?.url).toContain(`/projects/${ORG}/my-project/`);
		expect(result.alreadyExists).toBe(true);
		expect(result.dsn).toBe(key.dsn.public);
	});
});

describe("SentryObservability.ensureProject — create", () => {
	it("creates project when GET returns 404", async () => {
		const { obs, calls } = makeObs([
			{ status: 404, body: { detail: "The requested resource does not exist" } }, // GET → 404
			{ body: project }, // POST create
			{ body: [key] }, // GET keys
		]);
		const result = await obs.ensureProject({ name: "My Project", platform: "javascript" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain(`/teams/${ORG}/${ORG}/projects/`);
		expect(calls[1]?.body).toMatchObject({ name: "My Project", platform: "javascript" });
		expect(result.alreadyExists).toBe(false);
		expect(result.dsn).toBe(key.dsn.public);
	});

	it("rethrows non-404 errors from the existence check", async () => {
		const { obs } = makeObs([{ status: 403, body: { detail: "Forbidden" } }]);
		await expect(obs.ensureProject({ name: "My Project" })).rejects.toBeInstanceOf(ProviderApiError);
	});
});
