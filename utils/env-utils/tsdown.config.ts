import { library } from "@theholocron/tsdown-config/presets/library";
import type { UserConfig } from "tsdown";

const config: UserConfig = library({
	entry: ["src/index.ts", "src/lookup.ts"],
	deps: { neverBundle: [/^@theholocron\//, /^dotenv/] },
});

export default config;
