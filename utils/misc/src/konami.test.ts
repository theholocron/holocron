import { konami, KONAMI_CODE } from "./konami";

describe("konami.is function", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("detect the full Konami code sequence", () => {
		const mockEvent = new KeyboardEvent("keydown", { code: "" });

		let result = false;
		KONAMI_CODE.forEach((code) => {
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
		KONAMI_CODE.forEach((code) => {
			Object.defineProperty(mockEvent, "code", {
				value: code,
				writable: true,
			});
			result = konami.is(mockEvent);
		});

		expect(result).toBe(true);
	});
});
