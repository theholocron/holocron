import autocomplete from "inquirer-autocomplete-standalone";
import { type CLIOptions } from "@/cli";
import { findProjects } from "@/tasks";
import { $, getDirectoryByLevel } from "@/utils";

export async function searchPrompt(location?: string, msg?: string, options: CLIOptions): Promise<string> {
	const message = msg || "Choose a project:";

	const dirname: string = await autocomplete({
		emptyText: "No results found. Please enter the location",
		message,
		pageSize: 10,
		source: async (input?: string) => {
			const term = input?.toLowerCase() ?? "";
			const [, results] = await findProjects(location, options);
			const filtered = results
				.map(({ name, value }) => ({ name: `${name} (${getDirectoryByLevel(value)})`, value }))
				.filter(({ name }) => {
					const proj = name?.toLowerCase() ?? "";
					if (proj.length > 0) {
						return proj.includes(term);
					}

					return "";
				});

			return filtered;
		},
	});

	const [, dir] = await $.directory(dirname);
	return dir?.path ?? "";
}
