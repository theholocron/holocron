import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvParser } from "./create-env-parser.js";
import type { EnvLoader } from "./types.js";

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

function makeLoader(vars: Record<string, string>): EnvLoader {
	return { load: () => vars };
}

describe("createEnvParser", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it("exposes the parsed env object", () => {
		const { env } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ DATABASE_URL: "postgres://localhost/test" }),
		});

		expect(env).toEqual({ database_url: "postgres://localhost/test" });
	});

	it("produces nested objects from double-underscore keys", () => {
		const { env } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(env).toEqual({ allm: { service: { url: "http://allm" } } });
	});

	// --- get(): flat keys ---

	it("get() resolves a flat key using its original casing", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ DATABASE_URL: "postgres://localhost" }),
		});

		expect(get("DATABASE_URL")).toBe("postgres://localhost");
		expect(get("database_url")).toBe("postgres://localhost");
	});

	// --- get(): nested keys ---

	it("get() resolves a nested key via dot syntax", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(get("allm.service.url")).toBe("http://allm");
	});

	it("get() resolves a nested key via double underscore", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(get("allm__service__url")).toBe("http://allm");
		expect(get("ALLM__SERVICE__URL")).toBe("http://allm");
	});

	it("dot syntax and double underscore resolve to the same value", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(get("allm.service.url")).toBe(get("allm__service__url"));
	});

	it("get() returns an object when the path resolves to a namespace", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(get("allm.service")).toEqual({ url: "http://allm" });
	});

	// --- get(): missing keys ---

	it("get() returns undefined for a missing flat key", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ PORT: "3000" }),
		});

		expect(get("missing_key")).toBeUndefined();
	});

	it("get() returns undefined for a missing nested path", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ ALLM__SERVICE__URL: "http://allm" }),
		});

		expect(get("allm.service.nope")).toBeUndefined();
	});

	// --- get(): rename fallback pattern ---

	it("get() supports ?? fallback for renamed keys", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ NEW_DB_URL: "postgres://localhost/new" }),
		});

		const url = get("database_url") ?? get("new_db_url");
		expect(url).toBe("postgres://localhost/new");
	});

	it("get() prefers the primary key when both are present", () => {
		const { get } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({
				DATABASE_URL: "postgres://localhost/primary",
				NEW_DB_URL: "postgres://localhost/fallback",
			}),
		});

		const url = get("database_url") ?? get("new_db_url");
		expect(url).toBe("postgres://localhost/primary");
	});

	// --- map() ---

	it("map() builds a config shape from resolved get() calls", () => {
		const parser = createEnvParser({
			appName: "test-app",
			loader: makeLoader({
				PORT: "3000",
				DATABASE_URL: "postgres://localhost",
				ALLM__SERVICE__URL: "http://allm",
			}),
		});

		const config = parser.map((get) => ({
			port: get("port"),
			database: { url: get("database_url") },
			allm: { serviceUrl: get("allm.service.url") },
		}));

		expect(config).toEqual({
			port: 3000,
			database: { url: "postgres://localhost" },
			allm: { serviceUrl: "http://allm" },
		});
	});

	it("map() supports ?? fallback for renamed keys", () => {
		const parser = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ NEW_DB_URL: "postgres://localhost/new" }),
		});

		const config = parser.map((get) => ({
			database: { url: get("database_url") ?? get("new_db_url") },
		}));

		expect(config.database.url).toBe("postgres://localhost/new");
	});

	it("map() supports default values for optional keys", () => {
		const parser = createEnvParser({
			appName: "test-app",
			loader: makeLoader({}),
		});

		const config = parser.map((get) => ({
			port: get("port") ?? 3000,
		}));

		expect(config.port).toBe(3000);
	});

	it("deprecate() warns locally when the old key is still present", async () => {
		const { environment } = await import("./environment.js");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(environment.isDeployed).mockReturnValue(false);
		vi.stubEnv("DEBUG", "true");

		const { deprecate } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ NEW_DB_URL: "postgres://localhost" }),
		});

		deprecate("new_db_url", "database_url");
		expect(warn).toHaveBeenCalledOnce();
		const [message] = warn.mock.calls[0] as [string];
		expect(message).toContain("new_db_url");
		expect(message).toContain("database_url");
		expect(message).toContain("test-app");
	});

	it("deprecate() is silent when the old key is absent", () => {
		const { deprecate } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ DATABASE_URL: "postgres://localhost" }),
		});

		expect(() => deprecate("new_db_url", "database_url")).not.toThrow();
	});

	it("deprecate() is silent in deployed environments", async () => {
		const { environment } = await import("./environment.js");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(environment.isDeployed).mockReturnValue(true);

		const { deprecate } = createEnvParser({
			appName: "test-app",
			loader: makeLoader({ NEW_DB_URL: "postgres://localhost" }),
		});

		deprecate("new_db_url", "database_url");
		expect(warn).not.toHaveBeenCalled();
	});
});
