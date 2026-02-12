import { createToken, verifyToken } from "./users/auth";
import signup from "./users/signup";
import login from "./users/login";
import json from "./util/json";
import { profileget, profileput, profileimageput } from "./users/profile";
import { videoget, videoput } from "./util/video";
import { coursesget, coursespost, coursesdelete, coursesput } from "./course/course";
import { coursesbatchpost, coursesbatchget } from "./course/batch";
import { adminusersget, updateusers, deleteusers } from "./users/admin";
import { unitsget, unitsdelete, unitspost, unitsput, unitsvideoupdate, unitsvideosget } from "./course/units";
import { subjectsget, subjectsdelete, subjectspost, subjectsput } from "./course/subjects";
import { getVideoUploadLink, uploadImage } from "./util/upload";
import { streamWebhook } from "./util/video";

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
		else if (path === "/profile/image" && method === "PUT") return profileimageput(req, env);
		else if (path === "/video" && method === "GET") return videoget(req, env);
		else if (path === "/video" && method === "PUT") return videoput(req, env);
		else if (path === "/courses" && method === "GET") return coursesget(req, env);
		else if (path === "/courses" && method === "POST") return coursespost(req, env);
		else if (path === "/courses" && method === "DELETE") return coursesdelete(req, env);
		else if (path === "/courses" && method === "PUT") return coursesput(req, env);
		else if (path === "/courses/batch" && method === "GET") return coursesbatchget(req, env);
		else if (path === "/courses/batch" && method === "POST") return coursesbatchpost(req, env);

		else if (path === "/units" && method === "GET") return unitsget(req, env);
		else if (path === "/units" && method === "DELETE") return unitsdelete(req, env);
		else if (path === "/units" && method === "POST") return unitspost(req, env);
		else if (path === "/units" && method === "PUT") return unitsput(req, env);
		else if (path === "/units/notes" && method === "GET") return unitsnotesget(req, env);
		else if (path === "/units/notes" && method === "POST") return unitsnotespost(req, env);
		else if (path === "/units/notes" && method === "DELETE") return unitsnotesdelete(req, env);
		else if (path === "/units/notes" && method === "PUT") return unitsnotesput(req, env);
		else if (path === "/unit/videos/update" && method === "POST") return unitsvideoupdate(req, env);
		else if (path === "/unit/videos" && method === "GET") return unitsvideosget(req, env);
		else if (path === "/subjects" && method === "GET") return subjectsget(req, env);
		else if (path === "/subjects" && method === "DELETE") return subjectsdelete(req, env);
		else if (path === "/subjects" && method === "POST") return subjectspost(req, env);
		else if (path === "/subjects" && method === "PUT") return subjectsput(req, env)

		else if (path === "/stream/webhook" && method === "POST") return streamWebhook(req, env);
		else if (path === "/upload/image" && method === "PUT") return uploadImage(req, env);
		else if (path === "/admin/users" && method === "GET") return adminusersget(req, env);
		else if (path === "/admin/users" && method === "PUT") return updateusers(req, env);
		else if (path === "/admin/users" && method === "DELETE") return deleteusers(req, env);

		else if (path === "/upload/video" && method === "GET") return getVideoUploadLink(req, env);
		return new Response("Not Found", { status: 404 });
	},
};
