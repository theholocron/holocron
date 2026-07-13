import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadServiceAccountKey } from "../key.js";

const REQUIRED = {
	GOOGLE_TYPE: "service_account",
	GOOGLE_PROJECT_ID: "my-project",
	GOOGLE_PRIVATE_KEY_ID: "key-id-123",
	GOOGLE_PRIVATE_KEY:
		"-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIB\\n-----END RSA PRIVATE KEY-----",
	GOOGLE_CLIENT_EMAIL: "svc@my-project.iam.gserviceaccount.com",
	GOOGLE_CLIENT_ID: "123456789",
};

beforeEach(() => {
	for (const [k, v] of Object.entries(REQUIRED)) {
		process.env[k] = v;
	}
	delete process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
});

afterEach(() => {
	for (const k of [...Object.keys(REQUIRED), "GOOGLE_SERVICE_ACCOUNT_JSON"]) {
		delete process.env[k];
	}
});

describe("loadServiceAccountKey", () => {
	it("parses GOOGLE_SERVICE_ACCOUNT_JSON when set", () => {
		const creds = { type: "service_account", project_id: "json-project" };
		process.env["GOOGLE_SERVICE_ACCOUNT_JSON"] = JSON.stringify(creds);
		expect(loadServiceAccountKey()).toEqual(creds);
	});

	it("builds credentials from individual env vars", () => {
		const key = loadServiceAccountKey();
		expect(key.type).toBe("service_account");
		expect(key.project_id).toBe("my-project");
		expect(key.client_email).toBe("svc@my-project.iam.gserviceaccount.com");
	});

	it("unescapes \\\\n in GOOGLE_PRIVATE_KEY to actual newlines", () => {
		process.env["GOOGLE_PRIVATE_KEY"] = "line1\\nline2";
		const key = loadServiceAccountKey();
		expect(key.private_key).toBe("line1\nline2");
	});

	it("fills in well-known static URLs", () => {
		const key = loadServiceAccountKey();
		expect(key.auth_uri).toBe("https://accounts.google.com/o/oauth2/auth");
		expect(key.token_uri).toBe("https://oauth2.googleapis.com/token");
	});

	it("builds client_x509_cert_url from GOOGLE_CLIENT_EMAIL", () => {
		const key = loadServiceAccountKey();
		expect(key.client_x509_cert_url).toContain(
			encodeURIComponent("svc@my-project.iam.gserviceaccount.com"),
		);
	});

	it("throws when a required env var is missing", () => {
		delete process.env["GOOGLE_PRIVATE_KEY"];
		const err = (() => {
			try {
				loadServiceAccountKey();
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("GOOGLE_PRIVATE_KEY");
	});
});
