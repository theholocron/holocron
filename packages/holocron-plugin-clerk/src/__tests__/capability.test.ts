import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { ClerkAuth } from "../capabilities/auth.js";
import { createClerkClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

function makeAuth(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createClerkClient({ token: "sk_test_pat", fetch });
	const auth = new ClerkAuth(client);
	return { auth, calls };
}

describe("ClerkAuth identity", () => {
	it("reports key and providerName for the capability map", () => {
		const { auth } = makeAuth([]);
		expect(auth.key).toBe("auth");
		expect(auth.providerName).toBe("clerk");
	});
});

describe("ClerkAuth.describe", () => {
	it("lists the runtime env keys a Clerk-using app needs", async () => {
		const { auth } = makeAuth([]);
		const desc = await auth.describe();
		expect(desc.provider).toBe("clerk");
		expect(desc.envKeys).toEqual(["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]);
	});
});

describe("ClerkAuth.whoami", () => {
	it("GETs /users/count and surfaces total_count", async () => {
		const { auth, calls } = makeAuth([{ status: 200, body: { total_count: 42 } }]);
		const result = await auth.whoami();
		expect(calls[0]?.url).toBe("https://api.clerk.com/v1/users/count");
		expect(result.provider).toBe("clerk");
		expect(result.details?.userCount).toBe(42);
	});

	it("propagates ProviderApiError on auth failure", async () => {
		const { auth } = makeAuth([{ status: 401, text: "invalid secret key" }]);
		await expect(auth.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("ClerkAuth.ensureWebhookApp", () => {
	it("POSTs /webhooks/svix on a fresh instance", async () => {
		const { auth, calls } = makeAuth([{ status: 200, body: {} }]);
		const result = await auth.ensureWebhookApp!();
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.clerk.com/v1/webhooks/svix");
		expect(result).toEqual({ alreadyExists: false });
	});

	it('treats "already exists" errors as a successful no-op', async () => {
		const { auth } = makeAuth([{ status: 400, text: "you_already_have_a_svix_app" }]);
		const result = await auth.ensureWebhookApp!();
		expect(result).toEqual({ alreadyExists: true });
	});

	it('detects "already" in a free-form error body too', async () => {
		const { auth } = makeAuth([{ status: 400, text: '{"errors":[{"message":"this app already exists"}]}' }]);
		expect(await auth.ensureWebhookApp!()).toEqual({ alreadyExists: true });
	});

	it("rethrows unrelated errors (e.g. 401 invalid auth)", async () => {
		const { auth } = makeAuth([{ status: 401, text: "invalid secret key" }]);
		await expect(auth.ensureWebhookApp!()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("ClerkAuth.getWebhookDashboardUrl", () => {
	it("POSTs /webhooks/svix_url and returns the url field", async () => {
		const { auth, calls } = makeAuth([{ status: 200, body: { url: "https://app.svix.com/login/abc" } }]);
		const result = await auth.getWebhookDashboardUrl!();
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.clerk.com/v1/webhooks/svix_url");
		expect(result).toEqual({ url: "https://app.svix.com/login/abc" });
	});

	it("falls back to svix_url when older shape responds", async () => {
		const { auth } = makeAuth([{ status: 200, body: { svix_url: "https://app.svix.com/login/legacy" } }]);
		const result = await auth.getWebhookDashboardUrl!();
		expect(result.url).toBe("https://app.svix.com/login/legacy");
	});

	it("throws when neither url field is present", async () => {
		const { auth } = makeAuth([{ status: 200, body: {} }]);
		await expect(auth.getWebhookDashboardUrl!()).rejects.toThrow(/no `url` field/);
	});
});

describe("ClerkAuth.createUser", () => {
	it("POSTs /users with email + password + names, maps response", async () => {
		const { auth, calls } = makeAuth([
			{
				status: 200,
				body: {
					id: "user_2abc",
					email_addresses: [{ email_address: "jane@example.com" }],
				},
			},
		]);
		const result = await auth.createUser!({
			email: "jane@example.com",
			password: "hunter22",
			firstName: "Jane",
			lastName: "Doe",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.clerk.com/v1/users");
		expect(calls[0]?.body).toEqual({
			email_address: ["jane@example.com"],
			password: "hunter22",
			first_name: "Jane",
			last_name: "Doe",
		});
		expect(result).toEqual({ id: "user_2abc", email: "jane@example.com" });
	});

	it("omits first/last name from the body when not provided", async () => {
		const { auth, calls } = makeAuth([
			{
				status: 200,
				body: { id: "user_x", email_addresses: [{ email_address: "a@b.com" }] },
			},
		]);
		await auth.createUser!({ email: "a@b.com", password: "p" });
		expect(calls[0]?.body).toEqual({
			email_address: ["a@b.com"],
			password: "p",
		});
	});

	it("falls back to the input email when Clerk returns no email_addresses", async () => {
		const { auth } = makeAuth([{ status: 200, body: { id: "user_x", email_addresses: [] } }]);
		const result = await auth.createUser!({ email: "a@b.com", password: "p" });
		expect(result.email).toBe("a@b.com");
	});
});

describe("ClerkAuth.ensureWebhookApp — non-string details", () => {
	it("rethrows when ProviderApiError details is not a string (covers isAlreadyExistsError false branch)", async () => {
		// Use a JSON body so the HTTP client parses it as an object for `details`,
		// rather than the raw text path that produces a string.
		const { auth } = makeAuth([{ status: 400, body: { errors: [{ code: "unknown_error" }] } }]);
		await expect(auth.ensureWebhookApp!()).rejects.toBeInstanceOf(ProviderApiError);
	});
});
