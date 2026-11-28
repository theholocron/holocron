import type { PermissionRule, PluginToken } from "../../../auth/index.js";
import { tokenExpectations } from "../../../token-expectations/index.js";
import type { PermissionTable } from "../permission-tables/index.js";
import type { PermissionProblem } from "./compare-permissions.type.js";

const mentions = (heading: string, name: string): boolean => heading.toLowerCase().includes(name.toLowerCase());

/**
 * Compares what a plugin's tokens declare (`PluginToken.expect.permissions`, read through `tokenExpectations()`) with its
 * permission table in `tokens.mdx`, in both directions: a declared permission the table lacks or words differently for
 * a layer, and a permission or layer rule the table has that the declaration does not. The table is the one whose
 * heading names the token's `envName`, else the plugin (`short`, `cloudflare` for `holocron-plugin-cloudflare`). A token
 * that declares no permission rules is not compared.
 */
export function comparePermissions(
	tokens: readonly PluginToken[],
	tables: readonly PermissionTable[],
	short: string
): PermissionProblem[] {
	const problems: PermissionProblem[] = [];
	for (const token of tokens) {
		const declared = tokenExpectations([token]).filter((entry) => Object.keys(entry.rules).length > 0);
		if (declared.length === 0) continue;
		const { envName } = token;
		const table =
			tables.find((t) => mentions(t.heading, envName)) ?? tables.find((t) => mentions(t.heading, short));
		if (!table) {
			problems.push({ envName, layer: "any", permission: "", detail: "no permission table in tokens.mdx" });
			continue;
		}
		const byLayer = new Map<string, Record<string, PermissionRule>>(
			declared.map((entry) => [
				entry.layer,
				Object.fromEntries(Object.entries(entry.rules).map(([id, rule]) => [id.toLowerCase(), rule])),
			])
		);
		const ids = new Set([...byLayer.values()].flatMap((rules) => Object.keys(rules)));
		for (const entry of declared) {
			for (const [permission, rule] of Object.entries(entry.rules)) {
				const documented = table.rows[permission.toLowerCase()];
				if (!documented) {
					problems.push({ envName, layer: entry.layer, permission, detail: "not in the tokens.mdx table" });
				} else if (documented[entry.layer] !== rule) {
					problems.push({
						envName,
						layer: entry.layer,
						permission,
						detail: `declared ${rule}, tokens.mdx says ${documented[entry.layer] ?? "nothing"}`,
					});
				}
			}
		}
		for (const [permission, documented] of Object.entries(table.rows)) {
			if (!ids.has(permission)) {
				problems.push({ envName, layer: "any", permission, detail: "in the tokens.mdx table, not declared" });
				continue;
			}
			for (const [layer, rule] of Object.entries(documented)) {
				const declaredHere = byLayer.get(layer)?.[permission];
				if (declaredHere === undefined) {
					problems.push({ envName, layer, permission, detail: `tokens.mdx says ${rule}, nothing declared` });
				}
			}
		}
	}
	return problems;
}
