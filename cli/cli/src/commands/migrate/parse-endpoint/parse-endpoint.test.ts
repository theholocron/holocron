import { describe, expect, it } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { parseEndpoint } from "./parse-endpoint.js";

describe("parseEndpoint", () => {
	it("reads a bare provider", () => {
		expect(parseEndpoint("linear")).toEqual({ provider: "linear", options: {} });
	});

	it("reads options, trimming and keeping '=' inside a value", () => {
		expect(parseEndpoint("github: repo = o/r , token=a=b".replace(": ", ":"))).toEqual({
			provider: "github",
			options: { repo: "o/r", token: "a=b" },
		});
	});

	it("ignores an empty option list", () => {
		expect(parseEndpoint("linear:")).toEqual({ provider: "linear", options: {} });
	});

	it("names the flag when the provider or an option is wrong", () => {
		const bad = (spec: string, flag?: string) =>
			(() => {
				try {
					parseEndpoint(spec, flag);
				} catch (e) {
					return e;
				}
			})();
		expect(bad("")).toBeInstanceOf(ConfigError);
		expect((bad("Linear", "--to") as Error).message).toMatch(/^--to: "Linear"/);
		expect((bad("linear:team") as Error).message).toMatch(/"team" is not key=value/);
		expect((bad("linear:=x") as Error).message).toMatch(/is not key=value/);
	});
});
