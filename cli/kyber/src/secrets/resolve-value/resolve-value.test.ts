import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCredentials, setCredentials } from "../credential-store/index.js";
import { resolveValue } from "./resolve-value.js";

afterEach(() => {
	clearCredentials();
	vi.unstubAllEnvs();
});

describe("resolveValue", () => {
	it("prefers the environment over the credentials providers", () => {
		setCredentials("op", { ACCOUNT: "from-store" });
		expect(resolveValue(["ACCOUNT"], { ACCOUNT: "from-env" })).toBe("from-env");
	});

	it("falls back to the credentials providers when the environment has none", () => {
		setCredentials("op", { ACCOUNT: "from-store" });
		expect(resolveValue(["ACCOUNT"], {})).toBe("from-store");
	});

	it("treats an empty environment value as unset and tries the names in order", () => {
		setCredentials("op", { SECOND: "s" });
		expect(resolveValue(["FIRST", "SECOND"], { FIRST: "" })).toBe("s");
		expect(resolveValue(["FIRST", "SECOND"], { SECOND: "e", FIRST: "f" })).toBe("f");
	});

	it("is undefined when nothing has it, and reads the process environment by default", () => {
		expect(resolveValue(["KYBER_NO_SUCH_VALUE"], {})).toBeUndefined();
		vi.stubEnv("KYBER_RESOLVE_VALUE_TEST", "proc");
		expect(resolveValue(["KYBER_RESOLVE_VALUE_TEST"])).toBe("proc");
	});
});
