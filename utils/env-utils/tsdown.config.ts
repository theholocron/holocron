import { library } from "@theholocron/tsdown-config/presets/library";
import type { UserConfig } from "tsdown";

const config: UserConfig = library({
	deps: { neverBundle: [/^@theholocron\//, /^dotenv/] },
});

export default config;
