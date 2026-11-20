import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createDopplerClient } from "../index.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createDopplerClient({ token: "dp.st.test", fetch }), calls };
}

describe("webhooks", () => {
	it("GET /webhooks with the project", async () => {
		const { client, calls } = makeClient([{ body: { webhooks: [{ id: "w", url: "https://x" }] } }]);
		const res = await client.webhooks.list("holocron");
		expect(res.webhooks).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/webhooks?project=holocron");
	});

	it("POST /webhooks with the project and the body", async () => {
		const { client, calls } = makeClient([{ body: {} }]);
		await client.webhooks.create("holocron", { url: "https://x", name: "N", enableConfigs: ["prd"] });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("project=holocron");
		expect(calls[0]?.body).toMatchObject({ url: "https://x", name: "N", enableConfigs: ["prd"] });
	});
});
