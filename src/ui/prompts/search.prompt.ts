import autocomplete from "inquirer-autocomplete-standalone";
import { type CLIOptions } from "@/cli";
import { type Choice } from "./types";

export async function searchPrompt(source: Choice<string>[], message?: string, options?: CLIOptions): Promise<string> {
	return await autocomplete({
		emptyText: "No results found. Please enter a term",
		message: message || "Search a term",
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
