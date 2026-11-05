import { afterEach, describe, expect, it } from "vitest";

import { clearCredentials, getCredential, hasCredentials, setCredentials } from "./credential-store.js";

afterEach(clearCredentials);

describe("credential store", () => {
	it("returns undefined when nothing was set", () => {
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
	});

	it("returns a value by name", () => {
		setCredentials("1password:Holocron", { HOLOCRON_ORG_TOKEN: "abc" });
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBe("abc");
	});

	it("tries the names in the order given", () => {
		setCredentials("a", { GH_TOKEN: "vendor", HOLOCRON_READ_TOKEN: "own" });
		expect(getCredential("HOLOCRON_READ_TOKEN", "GH_TOKEN")).toBe("own");
		expect(getCredential("MISSING", "GH_TOKEN")).toBe("vendor");
	});

	it("takes the first source that has a value, in the order they were set", () => {
		setCredentials("first", { T: "one" });
		setCredentials("second", { T: "two", U: "u" });
		expect(getCredential("T")).toBe("one");
		expect(getCredential("U")).toBe("u");
	});

	it("skips an empty value", () => {
		setCredentials("first", { T: "" });
		setCredentials("second", { T: "two" });
		expect(getCredential("T")).toBe("two");
	});

	it("replaces a source that is set again", () => {
		setCredentials("a", { T: "old" });
		setCredentials("a", { T: "new" });
		expect(getCredential("T")).toBe("new");
	});

	it("says whether a source was set", () => {
		expect(hasCredentials("a")).toBe(false);
		setCredentials("a", {});
		expect(hasCredentials("a")).toBe(true);
	});

	it("forgets everything on clear", () => {
		setCredentials("a", { T: "x" });
		clearCredentials();
		expect(getCredential("T")).toBeUndefined();
		expect(hasCredentials("a")).toBe(false);
	});
});
