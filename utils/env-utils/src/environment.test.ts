import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_ENVIRONMENT,
	DEPLOYED_ENVIRONMENTS,
	environment,
} from "./index.js";

describe("environment", () => {
	describe("normalize", () => {
		it("normalizes canonical names", () => {
			expect(environment.normalize("local")).toBe("local");
			expect(environment.normalize("dev")).toBe("dev");
			expect(environment.normalize("qa")).toBe("qa");
			expect(environment.normalize("prod")).toBe("prod");
		});

		it("normalizes aliases", () => {
			expect(environment.normalize("development")).toBe("dev");
			expect(environment.normalize("test")).toBe("qa");
			expect(environment.normalize("staging")).toBe("qa");
			expect(environment.normalize("production")).toBe("prod");
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
			vi.stubEnv("ENVIRONMENT", "qa");
			expect(environment.get()).toBe("qa");
		});

		it("normalizes aliases from ENVIRONMENT", () => {
			vi.stubEnv("ENVIRONMENT", "staging");
			expect(environment.get()).toBe("qa");
		});

		it("falls back to ENV when ENVIRONMENT is missing", () => {
			vi.stubEnv("ENV", "development");
			expect(environment.get()).toBe("dev");
		});

		it("falls back to NODE_ENV when ENVIRONMENT and ENV are missing", () => {
			vi.stubEnv("NODE_ENV", "production");
			expect(environment.get()).toBe("prod");
		});

		it("falls back to DEFAULT_ENVIRONMENT when no env vars are set", () => {
			vi.stubEnv("NODE_ENV", "");
			expect(environment.get()).toBe(DEFAULT_ENVIRONMENT);
		});

		it("uses ENVIRONMENT first when multiple env vars are set", () => {
			vi.stubEnv("ENVIRONMENT", "qa");
			vi.stubEnv("ENV", "development");
			vi.stubEnv("NODE_ENV", "production");
			expect(environment.get()).toBe("qa");
		});
	});

	describe("isDeployed", () => {
		beforeEach(() => {
			vi.unstubAllEnvs();
		});

		it.each([
			["qa", true],
			["test", true],
			["staging", true],
			["prod", true],
			["production", true],
			["local", false],
			["dev", false],
			["development", false],
		])('returns %s for "%s"', (input, expected) => {
			vi.stubEnv("ENVIRONMENT", input);
			expect(environment.isDeployed()).toBe(expected);
		});

		it("uses environment variables when no input is provided", () => {
			vi.stubEnv("ENVIRONMENT", "qa");
			expect(environment.isDeployed()).toBe(true);
		});

		it("falls back to default environment when env is invalid", () => {
			vi.stubEnv("ENVIRONMENT", "totally-wrong");
			expect(environment.isDeployed()).toBe(
				DEPLOYED_ENVIRONMENTS.has(DEFAULT_ENVIRONMENT),
			);
		});
	});
});
