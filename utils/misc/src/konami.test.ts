import { vi } from "vitest";
import { konami } from "./index.ts";

class MockKeyboardEvent {
	constructor(public type: string, public options: { code?: string }) {}
}

// Replace KeyboardEvent with MockKeyboardEvent
global.KeyboardEvent = MockKeyboardEvent as unknown as typeof KeyboardEvent;

describe("Konami", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("detect the full Konami code sequence", () => {
		const mockEvent = new KeyboardEvent("keydown", { code: "" });

		let result = false;
		konami.CODE.forEach((code) => {
			Object.defineProperty(mockEvent, "code", {
				value: code,
				writable: true,
			});
			result = konami.is(mockEvent);
		});

		expect(result).toBe(true);
	});

	test("reset after entering an incorrect code", () => {
		const mockEvent = new KeyboardEvent("keydown", { code: "" });

		Object.defineProperty(mockEvent, "code", {
			value: "Escape",
			writable: true,
		});
		konami.is(mockEvent);

		let result = false;
		konami.CODE.forEach((code) => {
			Object.defineProperty(mockEvent, "code", {
				value: code,
				writable: true,
			});
			result = konami.is(mockEvent);
		});

		expect(result).toBe(true);
	});
});
