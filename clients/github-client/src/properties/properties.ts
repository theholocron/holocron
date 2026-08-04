import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export function properties(rest: RestClient) {
	return {
		setProperties: (repo: string, values: Record<string, string>): Promise<void> => {
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
