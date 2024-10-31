import { autocompletePrompt } from "./autocomplete.prompt";
import { confirmPrompt } from "./confirm.prompt";
import { inputPrompt } from "./input.prompt";
import { searchPrompt } from "./search.prompt";
import { selectPrompt } from "./select.prompt";
import { validate } from "./utils";

export * from "./types";

export const prompt = {
	autocomplete: autocompletePrompt,
	confirm: confirmPrompt,
	input: inputPrompt,
	search: searchPrompt,
	select: selectPrompt,
	validate,
};
