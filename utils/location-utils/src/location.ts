/** A position, shaped like the browser's `GeolocationCoordinates`. */
export interface IGeolocationCoordinates {
	/** Accuracy of `latitude` and `longitude`, in meters. */
	accuracy: number;
	/** Height above sea level, in meters, or `null` when unavailable. */
	altitude?: number | null;
	/** Accuracy of `altitude`, in meters, or `null` when unavailable. */
	altitudeAccuracy?: number | null;
	/** Direction of travel in degrees clockwise from true north, or `null` when unavailable. */
	heading?: number | null;
	/** Latitude in decimal degrees. */
	latitude: number;
	/** Longitude in decimal degrees. */
	longitude: number;
	/** Speed in meters per second, or `null` when unavailable. */
	speed?: number | null;
}

/**
 * Minimal structural logger seam — accept any object shaped like this
 * (including a real `@theholocron/observability` `Logger` via a thin
 * adapter) without this package taking a dependency on it. Defaults to
 * `console.warn` so behavior is unchanged when nothing is injected.
 */
export interface LocationLogger {
	/** Logs a warning. */
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
