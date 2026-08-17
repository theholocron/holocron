import { describe, expect, it } from "vitest";

import { createSentryClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";
const ORG = "my-org";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { projects: createSentryClient({ token: "tok", baseUrl: BASE, fetch }).projects, calls };
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

describe("projects.list", () => {
	it("GETs /organizations/{org}/projects/", async () => {
		const { projects, calls } = client([{ body: [project] }]);
		const result = await projects.list(ORG);
		expect(calls[0]?.url).toContain(`${BASE}/organizations/${ORG}/projects/`);
		expect(result).toEqual([project]);
	});
});

describe("projects.get", () => {
	it("GETs /projects/{org}/{slug}/", async () => {
		const { projects, calls } = client([{ body: project }]);
		const result = await projects.get(ORG, "my-project");
		expect(calls[0]?.url).toContain(`${BASE}/projects/${ORG}/my-project/`);
		expect(result.slug).toBe("my-project");
	});
});

describe("projects.create", () => {
	it("POSTs to /teams/{org}/{team}/projects/ with name and platform", async () => {
		const { projects, calls } = client([{ body: project }]);
		await projects.create(ORG, "backend", { name: "My Project", platform: "node" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`${BASE}/teams/${ORG}/backend/projects/`);
		expect(calls[0]?.body).toEqual({ name: "My Project", platform: "node" });
	});

	it("omits platform when not provided", async () => {
		const { projects, calls } = client([{ body: project }]);
		await projects.create(ORG, "backend", { name: "My Project" });
		expect(calls[0]?.body).toEqual({ name: "My Project" });
	});
});

describe("projects.keys", () => {
	it("GETs /projects/{org}/{slug}/keys/", async () => {
		const { projects, calls } = client([{ body: [key] }]);
		const result = await projects.keys(ORG, "my-project");
		expect(calls[0]?.url).toContain(`${BASE}/projects/${ORG}/my-project/keys/`);
		expect(result[0]?.dsn.public).toContain("sentry.io");
	});
});
