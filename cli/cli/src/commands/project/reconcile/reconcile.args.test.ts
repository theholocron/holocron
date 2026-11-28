import { describe, expect, it, vi } from "vitest";

import { projectReconcileArgs } from "./reconcile.args.js";

describe("projectReconcileArgs", () => {
	it("declares one optional text positional, the board", () => {
		const positional = vi.fn().mockReturnThis();
		projectReconcileArgs({ positional } as never);
		expect(positional).toHaveBeenCalledWith("board", expect.objectContaining({ type: "string" }));
	});
});
