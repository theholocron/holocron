import { ConfigError } from "@theholocron/kyber/config";

import type { AgentName, AgentOptions } from "../config/config.type.js";
import type { SplitAgent } from "./split-agent.type.js";

const AGENT_OPTIONS = ["dcg"] as const;

/**
 * Reads `agent` in either form, a name (`"claude"`) or a name with options (`["claude", { dcg: true }]`), the form a
 * provider takes. The name keeps its place in the resolved config, so everything that installs skills reads it as before;
 * the options, when there are any, are kept beside it. A malformed value, an option that does not exist, a `dcg` that is
 * not a boolean, and `dcg: true` on an agent that has no `.claude/settings.json` are a `ConfigError` naming the problem.
 */
export function splitAgent(raw: AgentName | [AgentName, AgentOptions] | undefined): SplitAgent {
	if (raw === undefined) return {};
	if (typeof raw === "string") return { agent: raw };
	if (!Array.isArray(raw) || typeof raw[0] !== "string" || raw.length > 2) {
		throw new ConfigError(
			'`agent` must be a name, or a name with its options: "claude" or ["claude", { dcg: true }]'
		);
	}
	const [agent, options] = raw;
	if (options === undefined) return { agent };
	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new ConfigError(`the options of the \`${agent}\` agent must be an object, like { dcg: true }`);
	}
	for (const key of Object.keys(options)) {
		if (!(AGENT_OPTIONS as readonly string[]).includes(key)) {
			throw new ConfigError(
				`the \`${agent}\` agent has no option \`${key}\` (the options are: ${AGENT_OPTIONS.join(", ")})`
			);
		}
	}
	if (options.dcg !== undefined && typeof options.dcg !== "boolean") {
		throw new ConfigError(`the \`dcg\` option of the \`${agent}\` agent must be true or false`);
	}
	if (options.dcg === true && agent !== "claude") {
		throw new ConfigError(
			`\`dcg\` wires a hook into .claude/settings.json, so it is an option of "claude", not "${agent}"`
		);
	}
	return { agent, agentOptions: options };
}
