import { describe, expect, it, vi } from "vitest";

import { groupMenu } from "./group-menu.js";

describe("groupMenu", () => {
	it("is a hidden `$0` command whose builder leaves the parser alone", () => {
		const menu = groupMenu("secrets", vi.fn());
		expect(menu.command).toBe("$0");
		expect(menu.describe).toBe(false);
		const parser = {} as never;
		expect((menu.builder as (a: never) => unknown)(parser)).toBe(parser);
	});

	it("opens the group with its name and the parsed arguments", async () => {
		const open = vi.fn(async () => {});
		const menu = groupMenu("repo upgrade", open);
		await (menu.handler as (a: never) => Promise<void>)({ cwd: "/x" } as never);
		expect(open).toHaveBeenCalledExactlyOnceWith("repo upgrade", { cwd: "/x" });
	});
});
