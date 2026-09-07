import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { SentryErrors } from "../capabilities/errors.js";
import { createSentryClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

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

	it("throws from whoami when no org is configured", async () => {
		const { errors } = makeErrors([], {});
		const err = await errors.whoami().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/requires `org`/);
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
		expect(result.org).toBe(ORG);
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
