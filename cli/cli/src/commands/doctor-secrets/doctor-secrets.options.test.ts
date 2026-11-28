import { describe, expect, it, vi } from "vitest";

import { doctorSecretsCommand } from "./doctor-secrets.command.js";

describe("doctor secrets options", () => {
	it("declares --env as a repeatable string", () => {
		const options: Array<[string, Record<string, unknown>]> = [];
		const yargs = {
			option: vi.fn((name: string, spec: Record<string, unknown>) => {
				options.push([name, spec]);
				return yargs;
			}),
		};
		(doctorSecretsCommand.builder as (y: unknown) => unknown)(yargs);
		const env = options.find(([name]) => name === "env");
		expect(env?.[1]).toMatchObject({ type: "string", array: true });
	});
});
