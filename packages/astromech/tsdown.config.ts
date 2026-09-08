import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: ["src/index.ts", "src/config/index.ts"],
	plugins: [transformTemplate()],
});
