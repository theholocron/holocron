import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadServiceAccountKey } from "./key.js";

const REQUIRED = {
	GOOGLE_TYPE: "service_account",
	GOOGLE_PROJECT_ID: "my-project",
	GOOGLE_PRIVATE_KEY_ID: "key-id-123",
	GOOGLE_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIB\\n-----END RSA PRIVATE KEY-----", // gitleaks:allow
	GOOGLE_CLIENT_EMAIL: "svc@my-project.iam.gserviceaccount.com",
	GOOGLE_CLIENT_ID: "123456789",
};

let source: Record<string, string | undefined>;

beforeEach(() => {
	source = { ...REQUIRED };
});

const load = () => loadServiceAccountKey(createEnvLookup(source));

describe("loadServiceAccountKey with the default lookup", () => {
	it("reads HOLOCRON_GOOGLE_* first and the bare GOOGLE_* as a fallback", () => {
		vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "bare" }));
		expect(loadServiceAccountKey()).toEqual({ project_id: "bare" });
		vi.stubEnv("HOLOCRON_GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "prefixed" }));
		expect(loadServiceAccountKey()).toEqual({ project_id: "prefixed" });
		vi.unstubAllEnvs();
	});
});

describe("loadServiceAccountKey", () => {
	it("parses GOOGLE_SERVICE_ACCOUNT_JSON when set", () => {
		const creds = { type: "service_account", project_id: "json-project" };
		source["GOOGLE_SERVICE_ACCOUNT_JSON"] = JSON.stringify(creds);
		expect(load()).toEqual(creds);
	});

	it("builds credentials from individual env vars", () => {
		const key = load();
		expect(key.type).toBe("service_account");
		expect(key.project_id).toBe("my-project");
		expect(key.client_email).toBe("svc@my-project.iam.gserviceaccount.com");
	});

	it("unescapes \\\\n in GOOGLE_PRIVATE_KEY to actual newlines", () => {
		source["GOOGLE_PRIVATE_KEY"] = "line1\\nline2";
		const key = load();
		expect(key.private_key).toBe("line1\nline2");
	});

	it("fills in well-known static URLs", () => {
		const key = load();
		expect(key.auth_uri).toBe("https://accounts.google.com/o/oauth2/auth");
		expect(key.token_uri).toBe("https://oauth2.googleapis.com/token");
	});

	it("builds client_x509_cert_url from GOOGLE_CLIENT_EMAIL", () => {
		const key = load();
		expect(key.client_x509_cert_url).toContain(encodeURIComponent("svc@my-project.iam.gserviceaccount.com"));
	});

	it("throws when a required env var is missing", () => {
		delete source["GOOGLE_PRIVATE_KEY"];
		const err = (() => {
			try {
				load();
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("GOOGLE_PRIVATE_KEY");
	});

	it("reads from the process environment when no lookup is given", () => {
		vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ type: "service_account" }));
		expect(loadServiceAccountKey()).toEqual({ type: "service_account" });
		vi.unstubAllEnvs();
	});
});
