import { describe, expect, it } from "vitest";

import { formatPublishFailures, publishFailuresMarkdown } from "./publish-failures.js";
import type { PublishFailure } from "./publish-failures.type.js";

const TLOG: PublishFailure = { name: "@theholocron/a", version: "1.0.0", kind: "tlog-conflict", message: "409" };
const OTHER: PublishFailure = {
	name: "@theholocron/b",
	version: "1.0.0",
	kind: "failed",
	message: "publish failed for b",
};

describe("formatPublishFailures", () => {
	it("names a tlog conflict and says the tarball is identical and what to do", () => {
		const text = formatPublishFailures([TLOG]).join("\n");
		expect(text).toContain("@theholocron/a@1.0.0");
		expect(text).toContain("identical tarball");
		expect(text).toContain("change the package's contents");
		expect(text).not.toContain("--skip-already-published");
	});

	it("lists another failure's message and the republish command", () => {
		const text = formatPublishFailures([OTHER]).join("\n");
		expect(text).toContain("publish failed for b");
		expect(text).toContain("holocron publish package --skip-already-published");
		expect(text).toContain("holocron doctor releases");
	});

	it("gives both pieces of advice for a mix", () => {
		const text = formatPublishFailures([TLOG, OTHER]).join("\n");
		expect(text).toContain("2 package(s)");
		expect(text).toContain("identical to one already");
		expect(text).toContain("--skip-already-published");
	});
});

describe("publishFailuresMarkdown", () => {
	it("renders a table row per package", () => {
		const md = publishFailuresMarkdown([TLOG, OTHER]);
		expect(md).toContain("## Packages not published");
		expect(md).toContain("| `@theholocron/a@1.0.0` | sigstore 409 (identical tarball already logged) |");
		expect(md).toContain("| `@theholocron/b@1.0.0` | failed |");
		expect(md.endsWith("\n")).toBe(false);
	});
});
