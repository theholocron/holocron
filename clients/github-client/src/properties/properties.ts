import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export function properties(rest: RestClient) {
	return {
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
