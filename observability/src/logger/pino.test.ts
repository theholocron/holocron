import pino from "pino";
import { describe, expect, it } from "vitest";

import type { LogLevel } from "../core/logger.js";
import { buildPinoOptions, createPinoInstance, PinoLogger } from "./pino.js";

function capture() {
	const lines: Record<string, unknown>[] = [];
	const stream = {
		write: (chunk: string) => {
			lines.push(JSON.parse(chunk) as Record<string, unknown>);
		},
	};
	return { lines, stream };
}

function makeLogger(level: LogLevel = "debug") {
	const { lines, stream } = capture();
	const logger = new PinoLogger(pino({ level }, stream));
	return { lines, logger };
}

describe("PinoLogger", () => {
	it("logs a bare string message at each level", () => {
		const { lines, logger } = makeLogger();
		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		logger.error("e");
		expect(lines.map((l) => [l.level, l.msg])).toEqual([
			[20, "d"],
			[30, "i"],
			[40, "w"],
			[50, "e"],
		]);
	});

	it("merges a context object and an optional message", () => {
		const { lines, logger } = makeLogger();
		logger.info({ repo: "theholocron/configs" }, "sync complete");
		expect(lines[0]).toMatchObject({ repo: "theholocron/configs", msg: "sync complete", level: 30 });
	});

	it("respects the configured level", () => {
		const { lines, logger } = makeLogger("warn");
		logger.info("dropped");
		logger.warn("kept");
		expect(lines.map((l) => l.msg)).toEqual(["kept"]);
	});

	it("child loggers inherit parent bindings and add their own", () => {
		const { lines, stream } = capture();
		const root = new PinoLogger(pino({ level: "info", base: { runId: "r1" } }, stream));
		const child = root.child({ module: "sync-github" });
		const grandchild = child.child({ repo: "theholocron/configs" });
		grandchild.info("opening PR");
		expect(lines[0]).toMatchObject({
			runId: "r1",
			module: "sync-github",
			repo: "theholocron/configs",
			msg: "opening PR",
		});
	});
});

describe("createPinoInstance", () => {
	const baseInput = {
		level: "info" as LogLevel,
		ci: true,
		tty: false,
		telemetryDisabled: false,
		base: { runId: "run-1", env: "ci" as const },
	};

	it("binds runId and env on every line", () => {
		const { lines, stream } = capture();
		const logger = new PinoLogger(createPinoInstance({ ...baseInput, destination: stream }));
		logger.info("one");
		logger.warn("two");
		for (const line of lines) {
			expect(line).toMatchObject({ runId: "run-1", env: "ci" });
		}
	});

	it("writes an ISO-8601 timestamp", () => {
		const { lines, stream } = capture();
		const logger = new PinoLogger(createPinoInstance({ ...baseInput, destination: stream }));
		logger.info("now");
		expect(lines[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	it("redacts sensitive fields before they reach the stream", () => {
		const { lines, stream } = capture();
		const logger = new PinoLogger(createPinoInstance({ ...baseInput, destination: stream }));
		logger.info({
			token: "xoxb-secret",
			apiKey: "ak_live_secret",
			headers: { authorization: "Bearer secret", "x-api-key": "secret" },
			context: { password: "hunter2" },
		});
		expect(lines[0]).toMatchObject({
			token: "[Redacted]",
			apiKey: "[Redacted]",
			headers: { authorization: "[Redacted]", "x-api-key": "[Redacted]" },
			context: { password: "[Redacted]" },
		});
	});

	it("honours the resolved level", () => {
		const { lines, stream } = capture();
		const logger = new PinoLogger(createPinoInstance({ ...baseInput, level: "error", destination: stream }));
		logger.warn("dropped");
		logger.error("kept");
		expect(lines.map((l) => l.msg)).toEqual(["kept"]);
	});
});

describe("buildPinoOptions", () => {
	const input = {
		level: "info" as LogLevel,
		ci: false,
		tty: false,
		telemetryDisabled: false,
		base: { runId: "run-1", env: "local" as const },
	};

	it("always sets level, base, redaction, and ISO timestamps", () => {
		const options = buildPinoOptions(input);
		expect(options.level).toBe("info");
		expect(options.base).toEqual({ runId: "run-1", env: "local" });
		expect((options.redact as { censor: string }).censor).toBe("[Redacted]");
		expect(options.timestamp).toBe(pino.stdTimeFunctions.isoTime);
	});

	it("attaches a transport when the environment calls for one", () => {
		const options = buildPinoOptions({ ...input, tty: true });
		expect(options.transport).toBeDefined();
	});

	it("omits the transport when plain stdout JSON is enough", () => {
		const options = buildPinoOptions({ ...input, ci: true });
		expect(options.transport).toBeUndefined();
	});

	it("omits the transport when a capture destination is supplied", () => {
		const stream = { write: () => {} };
		const options = buildPinoOptions({ ...input, tty: true, destination: stream });
		expect(options.transport).toBeUndefined();
	});
});
