import { describe, expect, it } from "vitest";

import { transportCode, worthRetrying } from "./transport.js";

const failed = (cause: unknown) => Object.assign(new TypeError("fetch failed"), { cause });

describe("transportCode", () => {
	it("reads the code off the cause", () => {
		expect(transportCode(failed({ code: "UND_ERR_CONNECT_TIMEOUT" }))).toBe("UND_ERR_CONNECT_TIMEOUT");
	});

	it("reads it from an AggregateError (a host with IPv4 and IPv6 addresses)", () => {
		expect(
			transportCode(
				failed({
					errors: [{ message: "x" }, { code: "ECONNREFUSED" }],
				})
			)
		).toBe("ECONNREFUSED");
	});

	it("has none for a bare failure, a cause without a code, or something that is not an Error", () => {
		expect(transportCode(new TypeError("fetch failed"))).toBeUndefined();
		expect(transportCode(failed({}))).toBeUndefined();
		expect(transportCode(failed("text"))).toBeUndefined();
		expect(transportCode(failed({ errors: [] }))).toBeUndefined();
		expect(transportCode("network gone")).toBeUndefined();
	});
});

describe("worthRetrying", () => {
	it("repeats anything that never left, for any method", () => {
		for (const code of ["UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]) {
			expect(worthRetrying(code, "POST")).toBe(true);
		}
	});

	it("repeats a dropped connection only for a read", () => {
		expect(worthRetrying("ECONNRESET", "GET")).toBe(true);
		expect(worthRetrying("UND_ERR_SOCKET", "HEAD")).toBe(true);
		expect(worthRetrying("ECONNRESET", "POST")).toBe(false);
		expect(worthRetrying("ECONNRESET", "DELETE")).toBe(false);
	});

	it("does not repeat an unknown failure or none", () => {
		expect(worthRetrying("SOMETHING_ELSE", "GET")).toBe(false);
		expect(worthRetrying(undefined, "GET")).toBe(false);
	});
});
