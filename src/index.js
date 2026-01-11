
export default {
	async fetch(req, env, ctx) {
		const url = URL.parse(req.url);
		const path = url.pathname;
		if (path == "/m") {
			return new Response(JSON.stringify({
				message: "Hi!"
			}));
		}
		return new Response("Hello World!");
	},
};