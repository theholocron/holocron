import { describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ select }));

import { promptEffort } from "./prompt-effort.js";

describe("promptEffort", () => {
	it("returns the chosen size", async () => {
		select.mockResolvedValueOnce("medium");
		expect(await promptEffort()).toBe("medium");
		expect(select).toHaveBeenCalledWith(expect.objectContaining({ message: "Effort:" }));
	});

	it("returns undefined when the person leaves it unset", async () => {
		select.mockResolvedValueOnce("none");
		expect(await promptEffort()).toBeUndefined();
	});
});
