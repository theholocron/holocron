import { describe, expect, it } from "vitest";

import { Permission, type PermissionName, permissionNames, permissions } from "../index.js";

describe("permissions", () => {
	it("turns names into Discord's decimal-string bitfield", () => {
		expect(permissions([])).toBe("0");
		expect(permissions(["ViewChannel"])).toBe("1024");
		expect(permissions(["ViewChannel", "SendMessages"])).toBe("3072");
		expect(permissions(["Administrator"])).toBe("8");
	});

	it("keeps bits above 2^32 exact", () => {
		expect(permissions(["ModerateMembers"])).toBe((1n << 40n).toString());
	});

	it("ignores a repeated name", () => {
		expect(permissions(["ViewChannel", "ViewChannel"])).toBe("1024");
	});

	it("rejects a name that is not a permission", () => {
		expect(() => permissions(["Nope" as PermissionName])).toThrow(/unknown Discord permission/);
	});
});

describe("permissionNames", () => {
	it("reads the names back out of a bitfield, in declaration order", () => {
		expect(permissionNames("3072")).toEqual(["ViewChannel", "SendMessages"]);
		expect(permissionNames("0")).toEqual([]);
	});

	it("round-trips every named permission", () => {
		const all = Object.keys(Permission) as PermissionName[];
		expect(permissionNames(permissions(all))).toEqual(all);
	});

	it("rejects something that is not a bitfield", () => {
		expect(() => permissionNames("-1")).toThrow(/invalid permission bitfield/);
		expect(() => permissionNames("1e3")).toThrow(/invalid permission bitfield/);
	});
});
