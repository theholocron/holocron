import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
	entry: ["src/index.ts", "src/config/index.ts", "src/lint/index.ts", "src/release/index.ts"],
	plugins: [transformTemplate({ dirs: ["/src/templates/configs/"] })],
});
