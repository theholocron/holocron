import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock googleapis before the modules under test import it
vi.mock("googleapis", () => {
	const docGet = vi.fn();
	const sheetGet = vi.fn();
	return {
		google: {
			docs: () => ({ documents: { get: docGet } }),
			sheets: () => ({ spreadsheets: { get: sheetGet } }),
			auth: {
				GoogleAuth: vi.fn().mockImplementation(() => ({
					getClient: vi.fn().mockResolvedValue({}),
				})),
			},
		},
		// Re-export the mocks so individual tests can configure them
		__docGet: docGet,
		__sheetGet: sheetGet,
	};
});

vi.mock("../authentication.js", () => ({
	googleAuth: vi.fn().mockResolvedValue({}),
}));

// Dynamic imports must come AFTER vi.mock calls
const { documents } = await import("../documents.js");
const { spreadsheets } = await import("../spreadsheets.js");
const googleapisMod = await import("googleapis") as unknown as { __docGet: ReturnType<typeof vi.fn>; __sheetGet: ReturnType<typeof vi.fn> };

describe("documents.get", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns an error tuple immediately when id is empty", async () => {
		const [err, data] = await documents.get("");
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("No ID");
		expect(data).toBeNull();
	});

	it("returns [null, data, timing] on success", async () => {
		googleapisMod.__docGet.mockResolvedValue({ data: { documentId: "doc-1", title: "My Doc" } });
		const [err, data] = await documents.get("doc-1");
		expect(err).toBeNull();
		expect((data as { documentId: string }).documentId).toBe("doc-1");
	});

	it("returns [error, null, timing] when the API call throws", async () => {
		googleapisMod.__docGet.mockRejectedValue(new Error("API error"));
		const [err, data] = await documents.get("doc-1");
		expect(err).toBeInstanceOf(Error);
		expect(data).toBeNull();
	});
});

describe("spreadsheets.get", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns an error tuple immediately when id is empty", async () => {
		const [err, data] = await spreadsheets.get("");
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("No ID");
		expect(data).toBeNull();
	});

	it("returns [null, data, timing] on success", async () => {
		googleapisMod.__sheetGet.mockResolvedValue({ data: { spreadsheetId: "sheet-1" } });
		const [err, data] = await spreadsheets.get("sheet-1");
		expect(err).toBeNull();
		expect((data as { spreadsheetId: string }).spreadsheetId).toBe("sheet-1");
	});

	it("returns [error, null, timing] when the API call throws", async () => {
		googleapisMod.__sheetGet.mockRejectedValue(new Error("Quota exceeded"));
		const [err, data] = await spreadsheets.get("sheet-1");
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("Quota exceeded");
		expect(data).toBeNull();
	});
});
