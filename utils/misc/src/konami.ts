export type TKonamiCode =
	| "ArrowDown"
	| "ArrowLeft"
	| "ArrowRight"
	| "ArrowUp"
	| "KeyA"
	| "KeyB";

const CODE: TKonamiCode[] = [
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

function is(event: KeyboardEvent): boolean {
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

export const konami = {
	CODE,
	is,
};
