import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import type { AgentName, AgentOptions } from "../config/config.type.js";
import { splitAgent } from "./split-agent.js";

const messageOf = (raw: unknown) => {
	try {
		splitAgent(raw as AgentName);
	} catch (err) {
		expect(err).toBeInstanceOf(ConfigError);
		return (err as Error).message;
	}
	return undefined;
};

describe("splitAgent", () => {
	it("takes no agent, a name, and a name with no options or with options", () => {
		expect(splitAgent(undefined)).toEqual({});
		expect(splitAgent("codex")).toEqual({ agent: "codex" });
		expect(splitAgent(["claude"] as unknown as [AgentName, AgentOptions])).toEqual({ agent: "claude" });
		expect(splitAgent(["claude", { dcg: true }])).toEqual({ agent: "claude", agentOptions: { dcg: true } });
		expect(splitAgent(["claude", {}])).toEqual({ agent: "claude", agentOptions: {} });
	});

	it("accepts dcg: false on any agent, since it asks for nothing", () => {
		expect(splitAgent(["codex", { dcg: false }])).toEqual({ agent: "codex", agentOptions: { dcg: false } });
	});

	it("names what is wrong with a value it cannot read", () => {
		expect(messageOf(7)).toContain("`agent` must be a name");
		expect(messageOf([])).toContain("`agent` must be a name");
		expect(messageOf([1, {}])).toContain("`agent` must be a name");
		expect(messageOf(["claude", {}, "extra"])).toContain("`agent` must be a name");
		expect(messageOf(["claude", "dcg"])).toContain("must be an object");
		expect(messageOf(["claude", ["dcg"]])).toContain("must be an object");
		expect(messageOf(["claude", null])).toContain("must be an object");
		expect(messageOf(["claude", { dcgg: true }])).toContain("no option `dcgg` (the options are: dcg)");
		expect(messageOf(["claude", { dcg: "yes" }])).toContain(
			"`dcg` option of the `claude` agent must be true or false"
		);
		expect(messageOf(["codex", { dcg: true }])).toContain('an option of "claude", not "codex"');
	});
});
