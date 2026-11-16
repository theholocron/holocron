import type { AgentName, AgentOptions } from "../config/config.type.js";

/** The agent named in `agent`, and the options given with it, when there were any. */
export interface SplitAgent {
	agent?: AgentName;
	agentOptions?: AgentOptions;
}
