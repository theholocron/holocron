/** One server emoji a layout's reactions name. */
export interface LayoutEmoji {
	/** The emoji's name, without colons. */
	name: string;
	/** The file in the repo it is made from when the server has none, as the layout wrote it. */
	image?: string;
}
