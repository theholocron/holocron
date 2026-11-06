import { describe, expect, it } from "vitest";

import { patchDockerfile } from "./patch-dockerfile.js";

describe("patchDockerfile", () => {
	it("rewrites the major and keeps the tag suffix", () => {
		expect(patchDockerfile("FROM node:20-alpine\n", 20, 22)).toBe("FROM node:22-alpine\n");
		expect(patchDockerfile("FROM node:20.11.0\n", 20, 22)).toBe("FROM node:22.11.0\n");
	});

	it("leaves other majors and other images alone", () => {
		expect(patchDockerfile("FROM node:18\n", 20, 22)).toBeNull();
		expect(patchDockerfile("FROM nginx:20\n", 20, 22)).toBeNull();
	});
});
