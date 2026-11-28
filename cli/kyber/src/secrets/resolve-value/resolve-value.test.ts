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

	describe("prefix", () => {
		it("tries the prefixed name before the bare one", () => {
			expect(resolveValue(["DATASET"], { HOLOCRON_DATASET: "new", DATASET: "old" }, { prefix: "HOLOCRON" })).toBe(
				"new"
			);
		});

		it("keeps the bare name working when only it is set", () => {
			expect(resolveValue(["DATASET"], { DATASET: "old" }, { prefix: "HOLOCRON" })).toBe("old");
		});

		it("builds the pair for each name in order", () => {
			expect(resolveValue(["A", "B"], { B: "b", HOLOCRON_B: "pb" }, { prefix: "HOLOCRON" })).toBe("pb");
			expect(resolveValue(["A", "B"], { A: "a", HOLOCRON_B: "pb" }, { prefix: "HOLOCRON" })).toBe("a");
		});

		it("asks the credentials providers for the same pair", () => {
			setCredentials("op", { HOLOCRON_DATASET: "from-store" });
			expect(resolveValue(["DATASET"], {}, { prefix: "HOLOCRON" })).toBe("from-store");
			clearCredentials();
			setCredentials("op", { DATASET: "bare-store" });
			expect(resolveValue(["DATASET"], {}, { prefix: "HOLOCRON" })).toBe("bare-store");
		});

		it("does not prefix a name that already carries the prefix", () => {
			expect(
				resolveValue(
					["HOLOCRON_DATASET"],
					{ HOLOCRON_HOLOCRON_DATASET: "x", HOLOCRON_DATASET: "y" },
					{ prefix: "HOLOCRON" }
				)
			).toBe("y");
		});

		it("changes nothing without a prefix", () => {
			expect(resolveValue(["DATASET"], { HOLOCRON_DATASET: "new" })).toBeUndefined();
		});
	});

	it("is undefined when nothing has it, and reads the process environment by default", () => {
		expect(resolveValue(["KYBER_NO_SUCH_VALUE"], {})).toBeUndefined();
		vi.stubEnv("KYBER_RESOLVE_VALUE_TEST", "proc");
		expect(resolveValue(["KYBER_RESOLVE_VALUE_TEST"])).toBe("proc");
	});
});
