import { reactionProblem } from "../reaction-problem/index.js";

/**
 * The first reason a forum tag's `emoji` cannot work, or undefined. A string with no colon at either end is a Unicode
 * emoji and kept as written (it is not judged). One that starts or ends with a colon is meant as a server emoji, so it
 * must be `:name:` (2 to 32 letters, digits and underscores), and the layout must give that emoji a picture somewhere
 * (`pictured`: the names an `image` is declared for, from `layoutEmojis()`), because a tag's `emoji` is only a name and
 * `setup` makes the emoji before any channel.
 */
export function tagEmojiProblem(
	tagName: string,
	emoji: string | undefined,
	pictured: ReadonlySet<string>
): string | undefined {
	if (emoji === undefined || !/^:|:$/.test(emoji)) return undefined;
	const noun = `tag \`${tagName}\` emoji`;
	const problem = reactionProblem(noun, emoji);
	if (problem) return problem;
	if (pictured.has(emoji.slice(1, -1))) return undefined;
	return `${noun} \`${emoji}\` has no picture: give the emoji an \`image\` in \`emojis\` or a reaction so \`setup\` can make it`;
}
