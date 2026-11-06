import { describe, expect, it } from "vitest";

import { describeNetworkError } from "./describe-network-error.js";

const err = (code: string, message = "boom", top = false) =>
	top
		? Object.assign(new Error(message), { code })
		: Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(message), { code }) });

describe("describeNetworkError", () => {
	const d = (e: unknown) => describeNetworkError(e, 10_000);
	it("names the usual causes in plain words", () => {
		expect(d(Object.assign(new Error("t"), { name: "TimeoutError" }))).toContain("no answer within 10s");
		expect(d(err("UND_ERR_CONNECT_TIMEOUT"))).toContain("no answer within 10s");
		expect(d(err("EAI_AGAIN"))).toContain("did not resolve");
		expect(d(err("ECONNRESET"))).toContain("cut off");
		expect(d(err("ENETUNREACH"))).toContain("no route");
		expect(d(err("SELF_SIGNED_CERT_IN_CHAIN"))).toContain("NODE_EXTRA_CA_CERTS");
	});
	it("falls back to the code and message, or the message alone", () => {
		expect(d(err("EWHATEVER", "odd"))).toBe("EWHATEVER: odd");
		expect(d(new Error("plain"))).toBe("plain");
		expect(d("just text")).toBe("just text");
		expect(d({ code: "EODD" })).toBe("EODD: ");
	});
});
