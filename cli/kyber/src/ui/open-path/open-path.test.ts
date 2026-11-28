import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const { openPath } = await import("./open-path.js");

function fakeChild(): EventEmitter & { unref: () => void } {
	const child = new EventEmitter() as EventEmitter & { unref: () => void };
	child.unref = vi.fn();
	return child;
}

describe("openPath", () => {
	const originalPlatform = process.platform;
	afterEach(() => {
		Object.defineProperty(process, "platform", { value: originalPlatform });
		spawnMock.mockReset();
	});

	it("uses `open` on macOS", () => {
		Object.defineProperty(process, "platform", { value: "darwin" });
		spawnMock.mockReturnValue(fakeChild());
		openPath("/tmp/repo");
		expect(spawnMock).toHaveBeenCalledWith("open", ["/tmp/repo"], { stdio: "ignore", detached: true });
	});

	it("uses `xdg-open` on Linux", () => {
		Object.defineProperty(process, "platform", { value: "linux" });
		spawnMock.mockReturnValue(fakeChild());
		openPath("/tmp/repo");
		expect(spawnMock).toHaveBeenCalledWith("xdg-open", ["/tmp/repo"], { stdio: "ignore", detached: true });
	});

	it("shells out via cmd /c start on Windows", () => {
		Object.defineProperty(process, "platform", { value: "win32" });
		spawnMock.mockReturnValue(fakeChild());
		openPath("C:\\repo");
		expect(spawnMock).toHaveBeenCalledWith("cmd", ["/c", "start", "", "C:\\repo"], {
			stdio: "ignore",
			detached: true,
		});
	});

	it("detaches the child so it outlives this process", () => {
		Object.defineProperty(process, "platform", { value: "darwin" });
		const child = fakeChild();
		spawnMock.mockReturnValue(child);
		openPath("/tmp/repo");
		expect(child.unref).toHaveBeenCalledTimes(1);
	});

	it("never throws when the opener binary is missing — swallows the error event", () => {
		Object.defineProperty(process, "platform", { value: "linux" });
		const child = fakeChild();
		spawnMock.mockReturnValue(child);
		expect(() => openPath("/tmp/repo")).not.toThrow();
		expect(() => child.emit("error", new Error("ENOENT"))).not.toThrow();
	});
});
