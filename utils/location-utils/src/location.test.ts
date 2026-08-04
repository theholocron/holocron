import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getCurrentLocation } from "./location.ts";

const fallback = {
	accuracy: 0,
	latitude: 0,
	longitude: 0,
	altitude: null,
	altitudeAccuracy: null,
	heading: null,
	speed: null,
};

function mockPermissions(state: PermissionState) {
	Object.defineProperty(navigator, "permissions", {
		value: { query: vi.fn().mockResolvedValue({ state }) },
		writable: true,
		configurable: true,
	});
}

function mockGeolocation(impl: Partial<Geolocation>) {
	Object.defineProperty(navigator, "geolocation", {
		value: impl,
		writable: true,
		configurable: true,
	});
}

describe("getCurrentLocation", () => {
	afterEach(() => vi.restoreAllMocks());

	describe("permission denied", () => {
		beforeEach(() => mockPermissions("denied"));

		test("returns fallback coordinates", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const result = await getCurrentLocation();
			expect(result).toEqual(fallback);
			expect(warnSpy).toHaveBeenCalledWith("Location permission denied, using fallback");
		});
	});

	describe("permission granted", () => {
		beforeEach(() => mockPermissions("granted"));

		test("returns mapped coordinates on success", async () => {
			const coords = {
				accuracy: 10,
				altitude: 100,
				altitudeAccuracy: 5,
				heading: 90,
				latitude: 37.7749,
				longitude: -122.4194,
				speed: 0,
			};
			mockGeolocation({
				getCurrentPosition: (success) => success({ coords } as GeolocationPosition),
			});

			const result = await getCurrentLocation();
			expect(result).toEqual(coords);
		});

		test("returns fallback with warning when geolocation throws", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const error = new Error("position unavailable");
			mockGeolocation({
				getCurrentPosition: (_success, reject) => reject!(error as GeolocationPositionError),
			});

			const result = await getCurrentLocation();
			expect(result).toEqual(fallback);
			expect(warnSpy).toHaveBeenCalledWith("Error fetching fresh location:", error);
		});
	});

	describe("permission prompt", () => {
		beforeEach(() => mockPermissions("prompt"));

		test("proceeds to geolocation request", async () => {
			const coords = {
				accuracy: 5,
				altitude: null,
				altitudeAccuracy: null,
				heading: null,
				latitude: 51.5074,
				longitude: -0.1278,
				speed: null,
			};
			mockGeolocation({
				getCurrentPosition: (success) => success({ coords } as GeolocationPosition),
			});

			const result = await getCurrentLocation();
			expect(result).toEqual(coords);
		});
	});
});
