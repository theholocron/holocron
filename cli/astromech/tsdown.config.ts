import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	// The reusable workflows and actions are inlined: `@theholocron/ci` is private and never published, and `dist/` carries
	// exactly the text it was built and tested with. Every other bare import stays external.
	deps: {
		neverBundle: (id: string) => /^[^./]/.test(id) && !/^@theholocron\/ci(?:\/|$)/.test(id),
		alwaysBundle: [/^@theholocron\/ci(?:\/|$)/],
	},
	entry: [
		"src/index.ts",
		"src/config/index.ts",
		"src/lint/index.ts",
		"src/release/index.ts",
		"src/repo-validation/index.ts",
	],
	plugins: [transformTemplate({ dirs: ["/src/templates/configs/"] })],
});
