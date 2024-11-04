export interface IGeolocationCoordinates {
	accuracy: number;
	altitude?: number | null;
	altitudeAccuracy?: number | null;
	heading?: number | null;
	latitude: number;
	longitude: number;
	speed?: number | null;
}

const fallbackCoordinates: IGeolocationCoordinates = {
	accuracy: 0,
	latitude: 0,
	longitude: 0,
	altitude: null,
	altitudeAccuracy: null,
	heading: null,
	speed: null,
};

export async function getCurrentLocation(): Promise<IGeolocationCoordinates> {
	const permissionStatus = await navigator.permissions.query({
		name: "geolocation",
	});
	if (permissionStatus.state === "denied") {
		console.warn("Location permission denied, using fallback");
		return fallbackCoordinates;
	}

	try {
		const position = await new Promise<GeolocationPosition>(
			(resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: true,
					timeout: 27000,
				});
			}
		);

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
		console.warn("Error fetching fresh location:", error);
		return fallbackCoordinates;
	}
}
