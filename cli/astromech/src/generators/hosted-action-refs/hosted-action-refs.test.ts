import { describe, expect, it } from "vitest";

import { CI_HOME, CI_TARGET, TEMPLATE_HOME } from "../ci-ref/index.js";
import { hostedActionRefs } from "./hosted-action-refs.js";

describe("hostedActionRefs", () => {
	it("calls an action that has no frozen copy by path", () => {
		expect(hostedActionRefs(`- uses: ${CI_HOME.actions}/format@${CI_HOME.ref}`)).toBe(
			"- uses: ./ci/actions/format"
		);
	});

	it("keeps the frozen copy for an action that has one", () => {
		expect(hostedActionRefs(`- uses: ${CI_HOME.actions}/setup@${CI_HOME.ref}`)).toBe(
			`- uses: ${TEMPLATE_HOME.actions}/setup@${TEMPLATE_HOME.ref}`
		);
	});

	it("leaves a workflow reference, and an action at another ref, alone", () => {
		const text = [
			`uses: ${CI_HOME.workflows}/test-unit.yml@${CI_HOME.ref}`,
			`uses: ${CI_HOME.actions}/setup@other`,
			"uses: actions/checkout@v7",
		].join("\n");
		expect(hostedActionRefs(text)).toBe(text);
	});

	it("reads the home it is given", () => {
		const home = { ...CI_TARGET, ref: "ci-v2" };
		expect(hostedActionRefs(`uses: ${home.actions}/format@ci-v2`, home)).toBe("uses: ./ci/actions/format");
		expect(hostedActionRefs(`uses: ${CI_TARGET.actions}/format@ci-v1`, home)).toBe(
			`uses: ${CI_TARGET.actions}/format@ci-v1`
		);
	});
});
