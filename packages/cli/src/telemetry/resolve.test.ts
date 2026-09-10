import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveDsn, resolvePostHogHost, resolvePostHogKey } from "./resolve.js";

const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		HOLOCRON_SENTRY_DSN: undefined,
		SENTRY_DSN: undefined,
		HOLOCRON_POSTHOG_PROJECT_TOKEN: undefined,
		POSTHOG_PROJECT_TOKEN: undefined,
		HOLOCRON_POSTHOG_HOST: undefined,
		POSTHOG_HOST: undefined,
	};
});
afterEach(() => {
	process.env = originalEnv;
});

describe("resolveDsn", () => {
	it("uses the built-in fallback when no env var is set", () => {
		expect(resolveDsn()).toContain("ingest.us.sentry.io");
	});
	it("prefers SENTRY_DSN over the fallback", () => {
		process.env["SENTRY_DSN"] = "https://vendor@o1.ingest.sentry.io/1";
		expect(resolveDsn()).toBe("https://vendor@o1.ingest.sentry.io/1");
	});
	it("prefers HOLOCRON_SENTRY_DSN over SENTRY_DSN", () => {
		process.env["HOLOCRON_SENTRY_DSN"] = "https://hlc@o2.ingest.sentry.io/2";
		process.env["SENTRY_DSN"] = "https://vendor@o1.ingest.sentry.io/1";
		expect(resolveDsn()).toBe("https://hlc@o2.ingest.sentry.io/2");
	});
});

describe("resolvePostHogKey / resolvePostHogHost", () => {
	it("uses the built-in fallback key + US host by default", () => {
		expect(resolvePostHogKey()).toMatch(/^phc_/);
		expect(resolvePostHogHost()).toBe("https://us.i.posthog.com");
	});
	it("prefers POSTHOG_PROJECT_TOKEN, then HOLOCRON_POSTHOG_PROJECT_TOKEN", () => {
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_vendor";
		expect(resolvePostHogKey()).toBe("phc_vendor");
		process.env["HOLOCRON_POSTHOG_PROJECT_TOKEN"] = "phc_holocron";
		expect(resolvePostHogKey()).toBe("phc_holocron");
	});
	it("honours HOLOCRON_POSTHOG_HOST", () => {
		process.env["HOLOCRON_POSTHOG_HOST"] = "https://eu.i.posthog.com";
		expect(resolvePostHogHost()).toBe("https://eu.i.posthog.com");
	});
});
