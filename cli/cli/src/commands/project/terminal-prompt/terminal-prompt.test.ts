import { afterEach, describe, expect, it, vi } from "vitest";

const confirm = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm, select }));

import { terminalPrompt } from "./terminal-prompt.js";

const setTty = (value: boolean | undefined) =>
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });

describe("terminalPrompt", () => {
	const original = process.stdin.isTTY;
	afterEach(() => {
		setTty(original);
		vi.clearAllMocks();
	});

	it("is interactive only when stdin is a terminal", () => {
		setTty(true);
		expect(terminalPrompt().interactive).toBe(true);
		setTty(undefined);
		expect(terminalPrompt().interactive).toBe(false);
	});

	it("confirms with the message and the default", async () => {
		confirm.mockResolvedValue(false);
		expect(await terminalPrompt().confirm("Close it?", true)).toBe(false);
		expect(confirm).toHaveBeenCalledWith({ message: "Close it?", default: true });
	});

	it("selects among plain string choices", async () => {
		select.mockResolvedValue("sprint");
		expect(await terminalPrompt().select("Template:", ["roadmap", "sprint"])).toBe("sprint");
		expect(select).toHaveBeenCalledWith({
			message: "Template:",
			choices: [{ value: "roadmap" }, { value: "sprint" }],
		});
	});
});
