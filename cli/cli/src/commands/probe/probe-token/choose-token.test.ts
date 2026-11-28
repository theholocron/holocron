import { beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => ({ select: vi.fn(), input: vi.fn(), password: vi.fn() }));
vi.mock("@inquirer/prompts", () => prompts);

import { chooseToken } from "./choose-token.js";

describe("chooseToken", () => {
	beforeEach(() => {
		prompts.select.mockReset();
		prompts.input.mockReset();
		prompts.password.mockReset();
	});

	it("asks for the provider and returns nothing when the configured token is wanted", async () => {
		prompts.select.mockResolvedValue("configured");
		expect(await chooseToken("cloudflare")).toBeUndefined();
		expect(prompts.select.mock.calls[0]![0].message).toContain("cloudflare");
		expect(prompts.input).not.toHaveBeenCalled();
		expect(prompts.password).not.toHaveBeenCalled();
	});

	it("asks for an Environment, defaulting to ci, and trims it", async () => {
		prompts.select.mockResolvedValue("environment");
		prompts.input.mockResolvedValue("  dev ");
		expect(await chooseToken("cloudflare")).toEqual({ environment: "dev" });
		expect(prompts.input.mock.calls[0]![0]).toMatchObject({ default: "ci" });
	});

	it("asks for a token with the input hidden", async () => {
		prompts.select.mockResolvedValue("paste");
		prompts.password.mockResolvedValue(" tok ");
		expect(await chooseToken("cloudflare")).toEqual({ token: "tok" });
		expect(prompts.password.mock.calls[0]![0]).toMatchObject({ mask: "*" });
	});
});
