import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./__tests__/obsidian-mock.js"));

const { StatusModal } = await import("./status-modal.js");

describe("StatusModal", () => {
	const chosen: string[] = [];
	const modal = new StatusModal({} as never, ["seed", "exploring", "in-progress", "dropped"], (state) =>
		chosen.push(state)
	);

	it("has a placeholder", () => {
		expect((modal as unknown as { placeholder: string }).placeholder).toBe("Set idea status");
	});

	it("lists every state for an empty query and filters by text", () => {
		expect(modal.getSuggestions(" ")).toHaveLength(4);
		expect(modal.getSuggestions("PRO")).toEqual(["in-progress"]);
		expect(modal.getSuggestions("zzz")).toEqual([]);
	});

	it("draws a state and passes the choice on", () => {
		const setText = vi.fn();
		modal.renderSuggestion("seed", { setText } as never);
		expect(setText).toHaveBeenCalledWith("seed");
		modal.onChooseSuggestion("dropped");
		expect(chosen).toEqual(["dropped"]);
	});
});
