import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: {
		notifier: "src/notifier/index.ts",
		prompts: "src/prompts/index.ts",
		secrets: "src/secrets/index.ts",
		ui: "src/ui/index.ts",
	},
});
