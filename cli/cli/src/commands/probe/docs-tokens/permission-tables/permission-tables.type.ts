import type { EnvironmentLayer } from "../../../../credentials-environments/index.js";
import type { PermissionRule } from "../../../auth/index.js";

/** What one table row says about one permission: its rule per layer; a layer left blank or with another word has none. */
export type DocumentedPermission = Partial<Record<EnvironmentLayer, PermissionRule>>;

/** One permission table of `tokens.mdx`: a table with an `Id` column and a column per layer. */
export interface PermissionTable {
	/** The text of the heading above the table, which says which token it describes. */
	heading: string;
	/** The documented permissions by the id in the `Id` column, lower case. */
	rows: Record<string, DocumentedPermission>;
}
