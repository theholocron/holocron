import type { TransportMultiOptions, TransportTargetOptions } from "pino";
import { describe, expect, it } from "vitest";

import { buildTransport } from "./transports.js";

const base = { level: "info", ci: false, tty: true, telemetryDisabled: false } as const;
const axiom = { dataset: "holocron-local", token: "xaat-secret" };

const targetsOf = (result: ReturnType<typeof buildTransport>): TransportTargetOptions[] => {
	if (!result) return [];
	if ("targets" in result) return (result as TransportMultiOptions).targets as TransportTargetOptions[];
	return [result as TransportTargetOptions];
};

describe("buildTransport", () => {
	it("local + TTY + no Axiom → single pino-pretty transport", () => {
		const result = buildTransport({ ...base });
		expect(targetsOf(result).map((t) => t.target)).toEqual(["pino-pretty"]);
	});

	it("CI + no Axiom → undefined (Pino's default NDJSON to stdout)", () => {
		const result = buildTransport({ ...base, ci: true, tty: false });
		expect(result).toBeUndefined();
	});

	it("local non-TTY + no Axiom → undefined", () => {
		const result = buildTransport({ ...base, tty: false });
		expect(result).toBeUndefined();
	});

	it("local + TTY + Axiom → pino-pretty and Axiom", () => {
		const result = buildTransport({ ...base, axiom });
		expect(targetsOf(result).map((t) => t.target)).toEqual(["pino-pretty", "@axiomhq/pino"]);
	});

	it("CI + Axiom → stdout JSON kept alongside Axiom", () => {
		const result = buildTransport({ ...base, ci: true, tty: false, axiom });
		expect(targetsOf(result).map((t) => t.target)).toEqual(["pino/file", "@axiomhq/pino"]);
	});

	it("passes Axiom dataset and token through to the transport options", () => {
		const result = buildTransport({ ...base, axiom });
		const axiomTarget = targetsOf(result).find((t) => t.target === "@axiomhq/pino");
		expect(axiomTarget?.options).toEqual({ dataset: "holocron-local", token: "xaat-secret" });
	});

	it("drops the Axiom transport when telemetry is disabled", () => {
		const result = buildTransport({ ...base, axiom, telemetryDisabled: true });
		expect(targetsOf(result).map((t) => t.target)).toEqual(["pino-pretty"]);
	});

	it("telemetry disabled in CI with Axiom credentials → back to plain stdout JSON", () => {
		const result = buildTransport({ ...base, ci: true, tty: false, axiom, telemetryDisabled: true });
		expect(result).toBeUndefined();
	});

	it("applies the resolved level to every transport", () => {
		const result = buildTransport({ ...base, level: "debug", axiom });
		for (const target of targetsOf(result)) {
			expect(target.level).toBe("debug");
		}
	});
});
