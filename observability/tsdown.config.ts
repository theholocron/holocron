import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: ["src/core.ts", "src/logger.ts", "src/errors.ts", "src/analytics.ts", "src/testing.ts", "src/index.ts"],
});
