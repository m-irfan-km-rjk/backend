import { createToken, verifyToken } from "./auth";
import signup from "./signup";
import login from "./login";
import json from "./json";
import { profileget, profileput } from "./profile";
import { videoget, videoput } from "./video";
import { coursesget, coursespost, coursesput, coursesdelete } from "./coures";

export default {
	async fetch(req, env, ctx) {
		const url = URL.parse(req.url);
		const path = url.pathname;
		const method = req.method;
		if (path == "/logins") { return new Response(JSON.stringify({ message: "Login" })); }
		else if (path === "/signup" && method === "POST") return signup(req, env);
		else if (path === "/login" && method === "POST") return login(req, env);
		else if (path == "/logout") { return json({ success: true }); }
		else if (path == "/profile" && method == "GET") return profileget(req, env);
		else if (path == "/profile" && method == "PUT") return profileput(req, env);
		else if (path === "/video" && method === "GET") return videoget(req, env);
		else if (path === "/video" && method === "PUT") return videoput(req, env);
		else if (path === "/courses" && method === "GET") return coursesget(req, env);
		else if (path === "/courses" && method === "POST") return coursespost(req, env);
		else if (path === "/courses" && method === "PUT") return coursesput(req, env,url);
		else if (path === "/courses" && method === "DELETE") return coursesdelete(req, env);

		return new Response("Not Found", { status: 404 });
	},
};
