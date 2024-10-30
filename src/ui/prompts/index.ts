import { confirmPrompt } from "./confirm.prompt";
import { searchPrompt } from "./search.prompt";
import { selectPrompt } from "./select.prompt";
import { validate } from "./utils";

export * from "./types";

export const prompt = {
	confirm: confirmPrompt,
	search: searchPrompt,
	select: selectPrompt,
	validate,
};
