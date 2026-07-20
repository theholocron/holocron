import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: ["src/index.ts", "src/testing.ts"],
	deps: { neverBundle: [/^@theholocron\//, /^vitest/] },
});
