import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/tsdown-config/presets/library";

export default library({ plugins: [transformTemplate()] });
