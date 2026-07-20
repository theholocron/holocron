import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── googleapis mock ──────────────────────────────────────────────────────────

const mockGetToken = vi.fn();
const mockGenerateAuthUrl = vi
	.fn()
	.mockReturnValue("https://accounts.google.com/o/oauth2/auth");
const mockGetClient = vi.fn().mockResolvedValue({ type: "JWT" });

class MockOAuth2 {
	generateAuthUrl = mockGenerateAuthUrl;
	getToken = mockGetToken;
	credentials: Record<string, unknown> = {};
}

class MockGoogleAuth {
	getClient = mockGetClient;
}

vi.mock("googleapis", () => ({
	google: {
		auth: { GoogleAuth: MockGoogleAuth, OAuth2: MockOAuth2 },
	},
}));

vi.mock("../key.js", () => ({
	loadServiceAccountKey: vi.fn().mockReturnValue({ type: "service_account" }),
}));

// ── node:http mock ────────────────────────────────────────────────────────────

type Handler = (
	req: { url: string },
	res: { end: (s: string) => void },
) => void;

let capturedHandler: Handler | null = null;
const mockServer = {
	listen: vi.fn().mockImplementation((_port: number, cb?: () => void) => {
		cb?.();
		return mockServer;
	}),
	destroy: vi.fn(),
};

vi.mock("node:http", () => ({
	default: {
		createServer: vi.fn().mockImplementation((handler: Handler) => {
			capturedHandler = handler;
			return mockServer;
		}),
	},
}));

vi.mock("server-destroy", () => ({
	default: vi.fn(),
}));

vi.mock("open", () => ({
	default: vi.fn().mockResolvedValue({ unref: vi.fn() }),
}));

// ── dynamic imports (after vi.mock) ───────────────────────────────────────────

const { googleAuth, oauth } = await import("../authentication.js");

// ── tests ─────────────────────────────────────────────────────────────────────

describe("googleAuth", () => {
	it("returns a client from GoogleAuth.getClient", async () => {
		const client = await googleAuth([
			"https://www.googleapis.com/auth/spreadsheets.readonly",
		]);
		expect(client).toMatchObject({ type: "JWT" });
	});

	it("accepts multiple scopes", async () => {
		const client = await googleAuth([
			"https://www.googleapis.com/auth/spreadsheets.readonly",
			"https://www.googleapis.com/auth/documents.readonly",
		]);
		expect(client).toBeDefined();
	});
});

describe("oauth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGenerateAuthUrl.mockReturnValue(
			"https://accounts.google.com/o/oauth2/auth",
		);
		mockGetClient.mockResolvedValue({ type: "JWT" });
		mockServer.listen.mockImplementation(
			(_port: number, cb?: () => void) => {
				cb?.();
				return mockServer;
			},
		);
		capturedHandler = null;
	});

	afterEach(() => {
		delete process.env["GOOGLE_CLIENT_ID"];
		delete process.env["GOOGLE_CLIENT_SECRET"];
	});

	it("rejects when GOOGLE_CLIENT_ID is missing", async () => {
		process.env["GOOGLE_CLIENT_SECRET"] = "secret";
		await expect(oauth(["scope"])).rejects.toThrow("GOOGLE_CLIENT_ID");
	});

	it("rejects when GOOGLE_CLIENT_SECRET is missing", async () => {
		process.env["GOOGLE_CLIENT_ID"] = "client-id";
		await expect(oauth(["scope"])).rejects.toThrow("GOOGLE_CLIENT_SECRET");
	});

	it("resolves with the OAuth2 client after a successful callback", async () => {
		process.env["GOOGLE_CLIENT_ID"] = "client-id";
		process.env["GOOGLE_CLIENT_SECRET"] = "client-secret";
		mockGetToken.mockResolvedValue({ tokens: { access_token: "tok" } });

		const promise = oauth(["https://www.googleapis.com/auth/drive"]);

		// Simulate the browser redirecting back to /oauth2callback
		await new Promise<void>((r) => setImmediate(r));
		expect(capturedHandler).not.toBeNull();
		await capturedHandler!(
			{ url: "/oauth2callback?code=test-code" },
			{ end: vi.fn() },
		);

		const result = await promise;
		expect(result).toBeDefined();
	});

	it("rejects when getToken throws inside the callback", async () => {
		process.env["GOOGLE_CLIENT_ID"] = "client-id";
		process.env["GOOGLE_CLIENT_SECRET"] = "client-secret";
		mockGetToken.mockRejectedValue(new Error("token exchange failed"));

		const promise = oauth(["scope"]);

		await new Promise<void>((r) => setImmediate(r));
		expect(capturedHandler).not.toBeNull();
		await capturedHandler!(
			{ url: "/oauth2callback?code=bad-code" },
			{ end: vi.fn() },
		);

		await expect(promise).rejects.toThrow("token exchange failed");
	});

	it("ignores requests that are not /oauth2callback", async () => {
		process.env["GOOGLE_CLIENT_ID"] = "client-id";
		process.env["GOOGLE_CLIENT_SECRET"] = "client-secret";
		mockGetToken.mockResolvedValue({ tokens: { access_token: "tok" } });

		const promise = oauth(["scope"]);

		await new Promise<void>((r) => setImmediate(r));
		// Unrelated path — should be ignored
		await capturedHandler!({ url: "/healthz" }, { end: vi.fn() });
		// Now send the real callback
		await capturedHandler!(
			{ url: "/oauth2callback?code=abc" },
			{ end: vi.fn() },
		);

		await expect(promise).resolves.toBeDefined();
	});
});
