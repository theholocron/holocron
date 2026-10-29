export interface IGeolocationCoordinates {
	accuracy: number;
	altitude?: number | null;
	altitudeAccuracy?: number | null;
	heading?: number | null;
	latitude: number;
	longitude: number;
	speed?: number | null;
}

/**
 * Minimal structural logger seam — accept any object shaped like this
 * (including a real `@theholocron/observability` `Logger` via a thin
 * adapter) without this package taking a dependency on it. Defaults to
 * `console.warn` so behavior is unchanged when nothing is injected.
 */
export interface LocationLogger {
	warn(message: string, meta?: unknown): void;
}

const consoleLogger: LocationLogger = {
	warn: (message, meta) => (meta === undefined ? console.warn(message) : console.warn(message, meta)),
};

const fallbackCoordinates: IGeolocationCoordinates = {
	accuracy: 0,
	latitude: 0,
	longitude: 0,
	altitude: null,
	altitudeAccuracy: null,
	heading: null,
	speed: null,
};

export async function getCurrentLocation(logger: LocationLogger = consoleLogger): Promise<IGeolocationCoordinates> {
	const permissionStatus = await navigator.permissions.query({
		name: "geolocation",
	});
	if (permissionStatus.state === "denied") {
		logger.warn("Location permission denied, using fallback");
		return fallbackCoordinates;
	}

	try {
		const position = await new Promise<GeolocationPosition>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 27000,
			});
		});

		return {
			accuracy: position.coords.accuracy,
			altitude: position.coords.altitude,
			altitudeAccuracy: position.coords.altitudeAccuracy,
			heading: position.coords.heading,
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			speed: position.coords.speed,
		};
	} catch (error) {
		logger.warn("Error fetching fresh location:", error);
		return fallbackCoordinates;
	}
}
