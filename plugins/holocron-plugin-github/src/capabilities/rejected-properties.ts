import type { OrgProperty } from "@theholocron/github-client";

/** The values `repo setup` sends for `true_false` properties; anything else is rejected. */
const BOOLEANS = new Set(["true", "false"]);

/**
 * What is wrong with `values` when compared with the organization's property definitions, one sentence per
 * problem, in the order the properties are given: a property the organization does not define, a value a
 * `single_select` or `multi_select` property does not allow, or a `true_false` property that is not `true` or
 * `false`. A `string` or `url` property has nothing to check here. Empty when every value fits its definition.
 */
export function rejectedProperties(
	values: Record<string, string | string[]>,
	schema: readonly OrgProperty[]
): string[] {
	const byName = new Map(schema.map((property) => [property.property_name, property]));
	const problems: string[] = [];
	for (const [name, value] of Object.entries(values)) {
		const definition = byName.get(name);
		if (!definition) {
			problems.push(`${name} is not a custom property of the organization`);
			continue;
		}
		const sent = Array.isArray(value) ? value : [value];
		if (definition.value_type === "true_false") {
			for (const item of sent.filter((item) => !BOOLEANS.has(item))) {
				problems.push(`${name} is "${item}", but it takes only true or false`);
			}
			continue;
		}
		const allowed = definition.allowed_values ?? [];
		if (definition.value_type !== "single_select" && definition.value_type !== "multi_select") continue;
		for (const item of sent.filter((item) => !allowed.includes(item))) {
			problems.push(`${name} has "${item}", which is not one of its allowed values (${allowed.join(", ")})`);
		}
	}
	return problems;
}
