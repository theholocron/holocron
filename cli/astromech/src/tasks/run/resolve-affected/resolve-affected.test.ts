import { describe, expect, it, vi } from "vitest";

import { resolveAffected } from "./resolve-affected.js";

function make(exitCode = 0) {
	const exec = vi.fn((_cmd: string, _args: string[], _o: { cwd: string }) => ({ exitCode }));
	return {
		exec,
		call: (input: Partial<Parameters<typeof resolveAffected>[0]>) =>
			resolveAffected({ env: {}, exec, cwd: "/repo", ...input }),
	};
}

describe("resolveAffected", () => {
	it("is off, and checks nothing, when --affected was not asked for", () => {
		const { call, exec } = make();
		expect(call({ base: "abc" })).toEqual({ affected: false });
		expect(exec).not.toHaveBeenCalled();
	});

	it("passes the --base ref to turbo as TURBO_SCM_BASE once it exists in the checkout", () => {
		const { call, exec } = make();
		expect(call({ affected: true, base: "abc123" })).toEqual({ affected: true, env: { TURBO_SCM_BASE: "abc123" } });
		expect(exec).toHaveBeenCalledWith("git", ["cat-file", "-e", "abc123^{commit}"], { cwd: "/repo" });
	});

	it("prefers --base over TURBO_SCM_BASE, and falls back to it", () => {
		const { call } = make();
		const env = { TURBO_SCM_BASE: "from-env" };
		expect(call({ affected: true, base: "flag", env }).env).toEqual({ TURBO_SCM_BASE: "flag" });
		expect(call({ affected: true, env }).env).toEqual({ TURBO_SCM_BASE: "from-env" });
	});

	it.each(["alpha", "main"])("runs everything on a push to %s, where HEAD equals the base", (branch) => {
		const { call, exec } = make();
		const plan = call({ affected: true, base: "abc", env: { GITHUB_EVENT_NAME: "push", GITHUB_REF_NAME: branch } });
		expect(plan.affected).toBe(false);
		expect(plan.notice).toContain(`push to ${branch}`);
		expect(exec).not.toHaveBeenCalled();
	});

	it("still goes affected on a push to a feature branch", () => {
		const { call } = make();
		const env = { GITHUB_EVENT_NAME: "push", GITHUB_REF_NAME: "feat/x" };
		expect(call({ affected: true, base: "abc", env }).affected).toBe(true);
	});

	it("runs everything, with a notice, when there is no base", () => {
		const { call, exec } = make();
		const plan = call({ affected: true });
		expect(plan.affected).toBe(false);
		expect(plan.notice).toContain("no base");
		expect(exec).not.toHaveBeenCalled();
	});

	it("runs everything, with a notice, when the base is not in a shallow checkout", () => {
		const { call } = make(128);
		const plan = call({ affected: true, base: "deadbeef" });
		expect(plan.affected).toBe(false);
		expect(plan.notice).toContain('base "deadbeef" is not in this checkout');
	});
});
