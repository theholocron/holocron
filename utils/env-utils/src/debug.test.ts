import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debugDeprecation, debugLog, warnMissingKey } from "./debug.js";
import type { EnvObject } from "./types.js";

const { isDeployedMock } = vi.hoisted(() => ({
	isDeployedMock: vi.fn(),
}));

vi.mock("./environment.js", () => ({
	environment: {
		get: vi.fn(),
		normalize: vi.fn(),
		isDeployed: isDeployedMock,
	},
}));

const APP = "test-app";

const flatEnv: EnvObject = {
	port: 3000,
	database_url: "postgres://localhost",
};

const nestedEnv: EnvObject = {
	db: {
		host: "localhost",
		port: 5432,
	},
	auth0: {
		domain: "example.auth0.com",
		config: {
			audience: "https://api.example.com",
		},
	},
	flat_key: "value",
};

describe("debug", () => {
	beforeEach(() => {
		isDeployedMock.mockReturnValue(false);
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe("debugLog", () => {
		it("logs key count and names when local and DEBUG=true", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");

			debugLog(APP, flatEnv);

			expect(info).toHaveBeenCalledOnce();
			const [message, meta] = info.mock.calls[0] as [
				string,
				{ keys: string[] },
			];
			expect(message).toContain("test-app");
			expect(message).toContain("2 key(s)");
			expect(meta.keys).toEqual(
				expect.arrayContaining(["port", "database_url"]),
			);
		});

		it("never logs values — only key names", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");

			debugLog(APP, flatEnv);

			const [, meta] = info.mock.calls[0] as [string, { keys: string[] }];
			for (const key of meta.keys) {
				expect(typeof key).toBe("string");
				expect(key).not.toBe("postgres://localhost");
				expect(key).not.toBe(3000);
			}
		});

		it("flattens nested keys to dot-path notation", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");

			debugLog(APP, nestedEnv);

			const [, meta] = info.mock.calls[0] as [string, { keys: string[] }];
			expect(meta.keys).toEqual(
				expect.arrayContaining([
					"db.host",
					"db.port",
					"auth0.domain",
					"auth0.config.audience",
					"flat_key",
				]),
			);
		});

		it("is silent when DEBUG is not set", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			debugLog(APP, flatEnv);
			expect(info).not.toHaveBeenCalled();
		});

		it("is silent when DEBUG=false", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "false");
			debugLog(APP, flatEnv);
			expect(info).not.toHaveBeenCalled();
		});

		it("is silent when DEBUG=0", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "0");
			debugLog(APP, flatEnv);
			expect(info).not.toHaveBeenCalled();
		});

		it("is silent in a deployed environment even when DEBUG=true", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			isDeployedMock.mockReturnValue(true);
			vi.stubEnv("DEBUG", "true");

			debugLog(APP, flatEnv);

			expect(info).not.toHaveBeenCalled();
		});

		it('accepts "1" as a truthy DEBUG value', () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "1");
			debugLog(APP, flatEnv);
			expect(info).toHaveBeenCalledOnce();
		});

		it('accepts "yes" as a truthy DEBUG value', () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "yes");
			debugLog(APP, flatEnv);
			expect(info).toHaveBeenCalledOnce();
		});

		it("accepts any casing of DEBUG value", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "TRUE");
			debugLog(APP, flatEnv);
			expect(info).toHaveBeenCalledOnce();
		});

		it("handles an empty env object gracefully", () => {
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");
			debugLog(APP, {});
			expect(info).toHaveBeenCalledOnce();
			const [message, meta] = info.mock.calls[0] as [
				string,
				{ keys: string[] },
			];
			expect(message).toContain("0 key(s)");
			expect(meta.keys).toEqual([]);
		});
	});

	describe("warnMissingKey", () => {
		it("warns with the key name when local and DEBUG=true", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");

			warnMissingKey(APP, "database_url");

			expect(warn).toHaveBeenCalledOnce();
			const [message] = warn.mock.calls[0] as [string];
			expect(message).toContain("database_url");
			expect(message).toContain("test-app");
		});

		it("is silent when DEBUG is not set", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			warnMissingKey(APP, "database_url");
			expect(warn).not.toHaveBeenCalled();
		});

		it("is silent in a deployed environment even when DEBUG=true", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			isDeployedMock.mockReturnValue(true);
			vi.stubEnv("DEBUG", "true");

			warnMissingKey(APP, "database_url");

			expect(warn).not.toHaveBeenCalled();
		});

		it("includes the missing key name in the warning message", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			vi.stubEnv("DEBUG", "true");

			warnMissingKey(APP, "some__nested__key");

			const [message] = warn.mock.calls[0] as [string];
			expect(message).toContain("some__nested__key");
		});
	});

	describe("debugDeprecation", () => {
		it("warns when the old key is present in the env", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

			debugDeprecation(APP, "database_url", "db__primary__url", flatEnv);

			expect(warn).toHaveBeenCalledOnce();
			const [message] = warn.mock.calls[0] as [string];
			expect(message).toContain("database_url");
			expect(message).toContain("db__primary__url");
			expect(message).toContain("test-app");
		});

		it("is silent when the old key is not present in the env", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			debugDeprecation(APP, "old_key_gone", "new_key", flatEnv);
			expect(warn).not.toHaveBeenCalled();
		});

		it("is silent in a deployed environment", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			isDeployedMock.mockReturnValue(true);

			debugDeprecation(APP, "database_url", "db__primary__url", flatEnv);

			expect(warn).not.toHaveBeenCalled();
		});

		it("does not require DEBUG to be set — deprecation warnings always fire locally", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			debugDeprecation(APP, "database_url", "db__primary__url", flatEnv);
			expect(warn).toHaveBeenCalledOnce();
		});

		it("only checks top-level keys — nested dot-path keys are not matched", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			debugDeprecation(APP, "db.host", "something_new", nestedEnv);
			expect(warn).not.toHaveBeenCalled();
		});

		it("includes both old and new key names in the warning", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			debugDeprecation(APP, "database_url", "db__primary__url", flatEnv);

			const [message] = warn.mock.calls[0] as [string];
			expect(message).toMatch(/deprecated/i);
			expect(message).toContain("database_url");
			expect(message).toContain("db__primary__url");
		});
	});
});
