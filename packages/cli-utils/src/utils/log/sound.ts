import play from "play-sound";

const player = play();

async function playSound(soundPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		player.play(soundPath, (err: Error | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

type FeedbackFunction = () => Promise<void>;

const error: FeedbackFunction = async () => {
	await playSound("./media/error.mp3");
};

const success: FeedbackFunction = async () => {
	await playSound("./media/success.mp3");
};

const warning: FeedbackFunction = async () => {
	await playSound("./media/warning.mp3");
};

export const sound = {
	error,
	success,
	warning,
};
