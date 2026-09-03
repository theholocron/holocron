import { workflowHeader } from "../../../setup-workflows.js";
import sentimentBotConfig from "./sentiment-bot-config.yml";

export function createConfig(): string {
	return workflowHeader("packages/cli/src/commands/setup/templates/sentiment-bot/create-config.ts") + sentimentBotConfig;
}
