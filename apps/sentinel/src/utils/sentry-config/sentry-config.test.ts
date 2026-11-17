import { NoopErrorSink } from "@theholocron/observability/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { init } = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@theholocron/observability/errors", () => ({
	SentrySink: class {
		init = init;
	},
}));

import { resolveErrorSink } from "./sentry-config.js";

function env(vars: Record<string, string | undefined>) {
	return { get: (name: string) => vars[name] };
}

beforeEach(() => {
	init.mockClear();
});

describe("resolveErrorSink", () => {
	it("returns a no-op sink and initialises nothing when SENTINEL_SENTRY_DSN is unset", () => {
		expect(resolveErrorSink(env({}))).toBeInstanceOf(NoopErrorSink);
		expect(init).not.toHaveBeenCalled();
	});

	it("does not read the CLI's DSN names", () => {
		expect(resolveErrorSink(env({ HOLOCRON_SENTRY_DSN: "https://cli", SENTRY_DSN: "https://cli" }))).toBeInstanceOf(
			NoopErrorSink
		);
	});

	it("returns an initialised Sentry sink when the DSN is set", () => {
		const sink = resolveErrorSink(env({ SENTINEL_SENTRY_DSN: "https://key@o0.ingest.sentry.io/1" }));
		expect(sink).not.toBeInstanceOf(NoopErrorSink);
		expect(init).toHaveBeenCalledWith({
			dsn: "https://key@o0.ingest.sentry.io/1",
			release: "sentinel",
			environment: "production",
			tags: { app: "sentinel" },
		});
	});

	it("names the environment from HOLOCRON_ENVIRONMENT, in any spelling it knows", () => {
		resolveErrorSink(env({ SENTINEL_SENTRY_DSN: "https://k@o0.ingest.sentry.io/1", HOLOCRON_ENVIRONMENT: "dev" }));
		expect(init).toHaveBeenCalledWith(expect.objectContaining({ environment: "development" }));
	});

	it("falls back to production for a name it does not know", () => {
		resolveErrorSink(env({ SENTINEL_SENTRY_DSN: "https://k@o0.ingest.sentry.io/1", HOLOCRON_ENVIRONMENT: "moon" }));
		expect(init).toHaveBeenCalledWith(expect.objectContaining({ environment: "production" }));
	});
});
