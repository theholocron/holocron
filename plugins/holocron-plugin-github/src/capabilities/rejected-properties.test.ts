import type { OrgProperty } from "@theholocron/github-client";
import { describe, expect, it } from "vitest";

import { rejectedProperties } from "./rejected-properties.js";

// the shape of the organization's real definitions: a multi_select without `monitoring`, a single_select, a
// true_false and a plain string
const SCHEMA: OrgProperty[] = [
	{
		property_name: "holocron_capabilities",
		value_type: "multi_select",
		allowed_values: ["ci", "source", "wiki"],
	},
	{ property_name: "holocron_profile", value_type: "single_select", allowed_values: ["library", "platform"] },
	{ property_name: "monorepo", value_type: "true_false", allowed_values: null },
	{ property_name: "notes", value_type: "string" },
	{ property_name: "empty_select", value_type: "single_select" },
];

describe("rejectedProperties", () => {
	it("is empty when every value fits its definition", () => {
		expect(
			rejectedProperties(
				{
					holocron_capabilities: ["ci", "wiki"],
					holocron_profile: "platform",
					monorepo: "true",
					notes: "anything",
				},
				SCHEMA
			)
		).toEqual([]);
	});

	it("names the value of a multi_select that its property does not allow", () => {
		const problems = rejectedProperties({ holocron_capabilities: ["ci", "monitoring", "source"] }, SCHEMA);
		expect(problems).toEqual([
			'holocron_capabilities has "monitoring", which is not one of its allowed values (ci, source, wiki)',
		]);
	});

	it("names every value that is not allowed, across properties", () => {
		const problems = rejectedProperties({ holocron_capabilities: ["x", "y"], holocron_profile: "docs" }, SCHEMA);
		expect(problems).toHaveLength(3);
		expect(problems[2]).toContain('holocron_profile has "docs"');
	});

	it("checks a single_select value as one item", () => {
		expect(rejectedProperties({ holocron_profile: "library" }, SCHEMA)).toEqual([]);
	});

	it("treats a select property with no allowed values as allowing nothing", () => {
		expect(rejectedProperties({ empty_select: "a" }, SCHEMA)).toEqual([
			'empty_select has "a", which is not one of its allowed values ()',
		]);
	});

	it("reports a property the organization does not define", () => {
		expect(rejectedProperties({ lifecycle: "active" }, SCHEMA)).toEqual([
			"lifecycle is not a custom property of the organization",
		]);
	});

	it("reports a true_false value that is not true or false", () => {
		expect(rejectedProperties({ monorepo: "yes" }, SCHEMA)).toEqual([
			'monorepo is "yes", but it takes only true or false',
		]);
	});

	it("leaves a string property alone, and takes an empty schema as nothing defined", () => {
		expect(rejectedProperties({ notes: "x".repeat(500) }, SCHEMA)).toEqual([]);
		expect(rejectedProperties({ monorepo: "true" }, [])).toEqual([
			"monorepo is not a custom property of the organization",
		]);
	});
});
