import type { RestClient } from "../utils.js";
import { repoBase, segment } from "../utils.js";

/** One custom property of an organization, as its schema defines it. */
export interface OrgProperty {
	property_name: string;
	/** `string`, `single_select`, `multi_select`, `true_false` or `url`. */
	value_type: string;
	required?: boolean;
	/** The values a `single_select` or `multi_select` property accepts; `null` for any other type. */
	allowed_values?: string[] | null;
}

export function properties(rest: RestClient) {
	return {
		/**
		 * The custom properties an organization defines, with their types and allowed values (read-only).
		 * The token needs read access to the organization's custom properties.
		 */
		orgSchema: (org: string): Promise<OrgProperty[]> =>
			rest.request<OrgProperty[]>(`/orgs/${segment(org)}/properties/schema`),

		/**
		 * `value` is a plain string for `string`/`single_select`/`true_false`
		 * custom properties, or a string array for `multi_select` ones —
		 * GitHub's own PATCH body accepts either per property. A single-string
		 * comma-joined value has no length ceiling GitHub documents, but real
		 * usage hits one in practice (a `string`-type property with enough
		 * joined values 422s as "too long"); `multi_select` has none.
		 */
		setProperties: (repo: string, values: Record<string, string | string[]>): Promise<void> => {
			const propertyList = Object.entries(values).map(([property_name, value]) => ({
				property_name,
				value,
			}));
			return rest.request<void>(`${repoBase(repo)}/properties/values`, {
				method: "PATCH",
				body: { properties: propertyList },
			});
		},
	};
}
