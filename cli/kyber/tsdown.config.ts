import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: {
		checks: "src/checks/index.ts",
		config: "src/config/index.ts",
		flags: "src/flags/index.ts",
		git: "src/git/index.ts",
		menu: "src/menu/index.ts",
		notifier: "src/notifier/index.ts",
		observability: "src/observability/index.ts",
		plugins: "src/plugins/index.ts",
		prompts: "src/prompts/index.ts",
		secrets: "src/secrets/index.ts",
		testing: "src/testing/index.ts",
		ui: "src/ui/index.ts",
	},
});
