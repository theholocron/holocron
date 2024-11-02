export type TKonamiCode =
	| "ArrowDown"
	| "ArrowLeft"
	| "ArrowRight"
	| "ArrowUp"
	| "KeyA"
	| "KeyB";

export const KONAMI_CODE: TKonamiCode[] = [
	"ArrowUp",
	"ArrowUp",
	"ArrowDown",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowLeft",
	"ArrowRight",
	"KeyB",
	"KeyA",
];

let index = 0;

export function hasKonamiCodeBeenEntered(event: KeyboardEvent): boolean {
	if (event.code === KONAMI_CODE[index]) {
		index++;

		// Entire Konami code sequence entered
		if (index === KONAMI_CODE.length) {
			// Reset index for potential future checks
			index = 0;
			return true;
		}
	}

	// Reset if incorrect key entered
	else {
		index = 0;
	}

	return false;
}
