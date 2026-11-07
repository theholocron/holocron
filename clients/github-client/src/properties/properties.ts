import type { RestClient } from "../utils.js";
import { repoBase, segment } from "../utils.js";

/** One custom property of an organization, as its schema defines it. */
export interface OrgProperty {
	/** The property's name. */
	property_name: string;
	/** `string`, `single_select`, `multi_select`, `true_false` or `url`. */
	value_type: string;
	/** Whether a repository must set the property. */
	required?: boolean;
	/** The values a `single_select` or `multi_select` property accepts; `null` for any other type. */
	allowed_values?: string[] | null;
	/** The value a repository gets when it sets none, or `null`. */
	default_value?: string | string[] | null;
	/** A line saying what the property is for, or `null`. */
	description?: string | null;
	/** Who may edit the property's value on a repository: `org_actors` or `org_and_repo_actors`, or `null`. */
	values_editable_by?: string | null;
}

/** One custom property value set on a repository. */
export interface RepoPropertyValue {
	/** The property's name. */
	property_name: string;
	/** A string, a string array for `multi_select`, or `null` when unset. */
	value: string | string[] | null;
}

export function properties(rest: RestClient) {
	return {
		/** The custom property values set on a repository (read-only). */
		getValues: (repo: string): Promise<RepoPropertyValue[]> =>
			rest.request<RepoPropertyValue[]>(`${repoBase(repo)}/properties/values`),

		/**
		 * The custom properties an organization defines, with their types and allowed values (read-only).
		 * The token needs read access to the organization's custom properties.
		 */
		orgSchema: (org: string): Promise<OrgProperty[]> =>
			rest.request<OrgProperty[]>(`/orgs/${segment(org)}/properties/schema`),

		/**
		 * Creates or replaces one custom property definition of the organization. GitHub replaces the whole definition,
		 * so send back every field the property already has (`orgSchema` has them); a field left out is reset.
		 * The token needs write access to the organization's custom properties (`Custom properties: admin`).
		 */
		setOrgProperty: (org: string, property: OrgProperty): Promise<OrgProperty> => {
			const { property_name, ...definition } = property;
			const body = Object.fromEntries(Object.entries(definition).filter(([, v]) => v !== undefined));
			return rest.request<OrgProperty>(`/orgs/${segment(org)}/properties/schema/${segment(property_name)}`, {
				method: "PUT",
				body,
			});
		},

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
