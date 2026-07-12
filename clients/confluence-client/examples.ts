// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import confluence from "./src";

/*
confluence.page.get('185181811688')
	.then(res => console.log({ res }));
*/


confluence.page.update('2075885825sasdf', {
	version: {
		number: 2,
	},
	title: "newtons test page",
	type: 'page',
	body: {
		editor: {
			value: "foo",
			representation: 'editor',
		},
	},
})
	.then(res => console.log({ res }));
