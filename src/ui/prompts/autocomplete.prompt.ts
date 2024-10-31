import autocomplete from "inquirer-autocomplete-standalone";
import { type Choice } from "./types";

export async function autocompletePrompt(source: Choice<string>[], msg?: string): Promise<string> {
	return await autocomplete({
		emptyText: "No results found. Please enter a term",
		message: msg || "Search a term",
		source: async (input?: string) =>
			source.filter(({ name }) => {
				const proj = name?.toLowerCase() ?? "";
				if (proj.length > 0) {
					return proj.includes(input?.toLowerCase() ?? "");
				}

				return "";
			}),
	});
}
