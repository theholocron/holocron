import { describe, expect, it, vi } from "vitest";

// The real clipboard is something a test must never touch.
const write = vi.hoisted(() => vi.fn(async (_text: string) => {}));
vi.mock("clipboardy", () => ({ default: { write } }));

import { copyToClipboard } from "./copy-to-clipboard.js";

describe("copyToClipboard", () => {
	it("writes the text with clipboardy", async () => {
		await copyToClipboard("A=1\n");
		expect(write).toHaveBeenCalledExactlyOnceWith("A=1\n");
	});
});
