import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ENVIRONMENT, DEPLOYED_ENVIRONMENTS, environment } from "./index.js";

describe("environment", () => {
	describe("normalize", () => {
		it("normalizes canonical names", () => {
			expect(environment.normalize("local")).toBe("local");
			expect(environment.normalize("development")).toBe("development");
			expect(environment.normalize("ci")).toBe("ci");
			expect(environment.normalize("test")).toBe("test");
			expect(environment.normalize("production")).toBe("production");
		});

		it("normalizes aliases", () => {
			expect(environment.normalize("dev")).toBe("development");
			expect(environment.normalize("stage")).toBe("test");
			expect(environment.normalize("stg")).toBe("test");
			expect(environment.normalize("staging")).toBe("test");
			expect(environment.normalize("qa")).toBe("test");
			expect(environment.normalize("prod")).toBe("production");
			expect(environment.normalize("prd")).toBe("production");
			expect(environment.normalize(" Production ")).toBe("production");
		});

		it("returns undefined for unknown strings", () => {
			expect(environment.normalize("foo")).toBeUndefined();
		});
	});

	describe("get", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
			vi.stubEnv("NODE_ENV", "");
		});

		it("returns DEFAULT_ENVIRONMENT for unknown value", () => {
			vi.stubEnv("NODE_ENV", "");
			vi.stubEnv("ENVIRONMENT", "foo");
			expect(environment.get()).toBe(DEFAULT_ENVIRONMENT);
		});

		it("uses ENVIRONMENT when set", () => {
			vi.stubEnv("ENVIRONMENT", "test");
			expect(environment.get()).toBe("test");
		});

		it("normalizes aliases from ENVIRONMENT", () => {
			vi.stubEnv("ENVIRONMENT", "staging");
			expect(environment.get()).toBe("test");
		});

		it("prefers HOLOCRON_ENVIRONMENT over ENVIRONMENT", () => {
			vi.stubEnv("HOLOCRON_ENVIRONMENT", "test");
			vi.stubEnv("ENVIRONMENT", "development");
			expect(environment.get()).toBe("test");
		});

		it("falls back to ENV when ENVIRONMENT is missing", () => {
			vi.stubEnv("ENV", "dev");
			expect(environment.get()).toBe("development");
		});

		it("falls back to NODE_ENV when ENVIRONMENT and ENV are missing", () => {
			vi.stubEnv("NODE_ENV", "production");
			expect(environment.get()).toBe("production");
		});

		it("falls back to DEFAULT_ENVIRONMENT when no env vars are set", () => {
			vi.stubEnv("NODE_ENV", "");
			expect(environment.get()).toBe(DEFAULT_ENVIRONMENT);
		});

		it("uses ENVIRONMENT first when multiple env vars are set", () => {
			vi.stubEnv("ENVIRONMENT", "test");
			vi.stubEnv("ENV", "development");
			vi.stubEnv("NODE_ENV", "production");
			expect(environment.get()).toBe("test");
		});
	});

	describe("isDeployed", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
		});

		it.each([
			["test", true],
			["stage", true],
			["qa", true],
			["staging", true],
			["prod", true],
			["production", true],
			["local", false],
			["ci", false],
			["dev", false],
			["development", false],
		])('returns %s for "%s"', (input, expected) => {
			vi.stubEnv("ENVIRONMENT", input);
			expect(environment.isDeployed()).toBe(expected);
		});

		it("uses environment variables when no input is provided", () => {
			vi.stubEnv("ENVIRONMENT", "test");
			expect(environment.isDeployed()).toBe(true);
		});

		it("falls back to default environment when env is invalid", () => {
			vi.stubEnv("ENVIRONMENT", "totally-wrong");
			expect(environment.isDeployed()).toBe(DEPLOYED_ENVIRONMENTS.has(DEFAULT_ENVIRONMENT));
		});
	});
});
