import { describe, expect, it } from "vitest";

import { hostedReusableFile } from "./hosted-reusables.js";

describe("hostedReusableFile", () => {
	const content = [
		"      - uses: theholocron/.github/.github/actions/setup@main",
		"      - uses: theholocron/.github/.github/actions/codecov-upload@main",
		"",
	].join("\n");

	it("runs the upload action from this checkout, so a change to it takes effect on the PR that makes it", () => {
		const file = hostedReusableFile("test:unit", content);
		expect(file).toContain("uses: ./ci/actions/codecov-upload");
		expect(file).not.toContain("actions/codecov-upload@main");
	});

	it("leaves the other actions on their full ref", () => {
		expect(hostedReusableFile("test:unit", content)).toContain(
			"uses: theholocron/.github/.github/actions/setup@main"
		);
	});

	it("keeps the generated header and the source marker", () => {
		const file = hostedReusableFile("test:unit", content);
		expect(file).toContain("ci/workflows/test/unit.yml");
		expect(file).toContain("# Source package: .\n\n");
	});
});
