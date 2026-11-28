import { type App, SuggestModal } from "obsidian";

/** The fixed list of states that Obsidian's property editor lacks: pick one and it is set on the note. */
export class StatusModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly states: string[],
		private readonly onChoose: (state: string) => void
	) {
		super(app);
		this.setPlaceholder("Set idea status");
	}

	/** The states that contain the typed text, in the configured order. */
	getSuggestions(query: string): string[] {
		const needle = query.trim().toLowerCase();
		return this.states.filter((state) => state.toLowerCase().includes(needle));
	}

	/** Draws one state. */
	renderSuggestion(state: string, el: HTMLElement): void {
		el.setText(state);
	}

	/** Passes the chosen state on. */
	onChooseSuggestion(state: string): void {
		this.onChoose(state);
	}
}
