import { describe, expect, it } from "vitest";
import { createClerkClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sk_test_abc123";

const mockUser = {
	id: "user_1",
	object: "user" as const,
	external_id: null,
	primary_email_address_id: "idn_1",
	primary_phone_number_id: null,
	primary_web3_wallet_id: null,
	username: null,
	first_name: "Test",
	last_name: "User",
	profile_image_url: "https://example.com/avatar.jpg",
	image_url: "https://example.com/avatar.jpg",
	has_image: false,
	public_metadata: {},
	private_metadata: {},
	unsafe_metadata: {},
	email_addresses: [],
	phone_numbers: [],
	last_sign_in_at: null,
	banned: false,
	locked: false,
	lockout_expires_in_seconds: null,
	verification_attempts_remaining: null,
	created_at: 1700000000000,
	updated_at: 1700000000000,
	password_enabled: false,
	two_factor_enabled: false,
	totp_enabled: false,
	backup_code_enabled: false,
};

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createClerkClient({ token: TOKEN, fetch });
	return { client, calls };
}

describe("users.list", () => {
	it("GET /users", async () => {
		const { client, calls } = makeClient([{ body: [mockUser] }]);
		await client.users.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/users");
	});

	it("passes limit and offset as query params", async () => {
		const { client, calls } = makeClient([{ body: [mockUser] }]);
		await client.users.list({ limit: 10, offset: 20 });
		expect(calls[0]?.url).toContain("limit=10");
		expect(calls[0]?.url).toContain("offset=20");
	});

	it("passes array params as repeated keys", async () => {
		const { client, calls } = makeClient([{ body: [mockUser] }]);
		await client.users.list({
			email_address: ["a@example.com", "b@example.com"],
		});
		expect(calls[0]?.url).toContain(
			"email_address=a%40example.com&email_address=b%40example.com",
		);
	});
});

describe("users.count", () => {
	it("GET /users/count", async () => {
		const { client, calls } = makeClient([
			{ body: { object: "total_count", total_count: 42 } },
		]);
		const result = await client.users.count();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/users/count");
		expect(result.total_count).toBe(42);
	});
});

describe("users.get", () => {
	it("GET /users/:id", async () => {
		const { client, calls } = makeClient([{ body: mockUser }]);
		await client.users.get("user_1");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/users/user_1");
	});
});

describe("users.create", () => {
	it("POST /users", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: { ...mockUser, first_name: "New" } },
		]);
		await client.users.create({ first_name: "New", last_name: "User" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/users");
		expect(calls[0]?.body).toMatchObject({
			first_name: "New",
			last_name: "User",
		});
	});
});

describe("users.update", () => {
	it("PATCH /users/:id", async () => {
		const { client, calls } = makeClient([
			{ body: { ...mockUser, first_name: "Updated" } },
		]);
		await client.users.update("user_1", { first_name: "Updated" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/users/user_1");
		expect(calls[0]?.body).toMatchObject({ first_name: "Updated" });
	});
});

describe("users.delete", () => {
	it("DELETE /users/:id returns deleted object", async () => {
		const { client, calls } = makeClient([
			{ body: { object: "user", id: "user_1", deleted: true } },
		]);
		const result = await client.users.delete("user_1");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/users/user_1");
		expect(result.deleted).toBe(true);
	});
});

describe("users.ban / unban / lock / unlock", () => {
	it("POST /users/:id/ban", async () => {
		const { client, calls } = makeClient([
			{ body: { ...mockUser, banned: true } },
		]);
		const result = await client.users.ban("user_1");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/users/user_1/ban");
		expect(result.banned).toBe(true);
	});

	it("POST /users/:id/unban", async () => {
		const { client, calls } = makeClient([{ body: mockUser }]);
		await client.users.unban("user_1");
		expect(calls[0]?.url).toContain("/users/user_1/unban");
	});

	it("POST /users/:id/lock", async () => {
		const { client, calls } = makeClient([
			{ body: { ...mockUser, locked: true } },
		]);
		const result = await client.users.lock("user_1");
		expect(calls[0]?.url).toContain("/users/user_1/lock");
		expect(result.locked).toBe(true);
	});

	it("POST /users/:id/unlock", async () => {
		const { client, calls } = makeClient([{ body: mockUser }]);
		await client.users.unlock("user_1");
		expect(calls[0]?.url).toContain("/users/user_1/unlock");
	});
});
