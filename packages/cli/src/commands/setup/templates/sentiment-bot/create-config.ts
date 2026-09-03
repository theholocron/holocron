import { createHeader } from "../../../../create-header/index.js";
import sentimentBotConfig from "./sentiment-bot-config.yml";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/commands/setup/templates/sentiment-bot/create-config.ts",
});

export function createConfig(): string {
	return workflowHeader() + sentimentBotConfig;
}
