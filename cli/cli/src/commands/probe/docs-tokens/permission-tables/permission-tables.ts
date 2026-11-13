import { ENVIRONMENT_LAYERS } from "../../../../credentials-environments/index.js";
import type { PermissionRule } from "../../../auth/index.js";
import type { DocumentedPermission, PermissionTable } from "./permission-tables.type.js";

const clean = (cell: string): string => cell.replace(/[`*_]/g, "").trim().toLowerCase();

function cells(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

const isTableLine = (line: string | undefined): line is string => line !== undefined && line.trim().startsWith("|");
const isSeparator = (line: string | undefined): boolean => isTableLine(line) && /^[\s|:-]+$/.test(line);

function rule(cell: string | undefined): PermissionRule | undefined {
	const word = clean(cell ?? "");
	return word === "required" || word === "absent" ? word : undefined;
}

/**
 * Reads the permission tables of `tokens.mdx`: a table whose header has an `Id` column and a column named for a layer
 * (`local`, `dev`, `ci`, `prod`). A cell says `required` or `absent`; anything else (a dash, blank) is no rule. Other
 * tables, extra columns and prose around a table are ignored, so a page can grow rows and columns without a change here.
 */
export function permissionTables(page: string): PermissionTable[] {
	const lines = page.split("\n");
	const tables: PermissionTable[] = [];
	let heading = "";
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const title = /^#{1,6}\s+(.*)$/.exec(line);
		if (title) heading = title[1]!.trim();
		if (!isTableLine(line) || !isSeparator(lines[i + 1])) continue;
		const header = cells(line).map(clean);
		const idColumn = header.indexOf("id");
		const layerColumns = ENVIRONMENT_LAYERS.map((layer) => [layer, header.indexOf(layer)] as const).filter(
			([, column]) => column >= 0
		);
		let end = i + 2;
		while (isTableLine(lines[end])) end++;
		if (idColumn >= 0 && layerColumns.length > 0) {
			const rows: Record<string, DocumentedPermission> = {};
			for (const row of lines.slice(i + 2, end)) {
				const values = cells(row);
				const id = clean(values[idColumn] ?? "");
				if (id === "") continue;
				const documented: DocumentedPermission = {};
				for (const [layer, column] of layerColumns) {
					const found = rule(values[column]);
					if (found) documented[layer] = found;
				}
				rows[id] = documented;
			}
			tables.push({ heading, rows });
		}
		i = end - 1;
	}
	return tables;
}
