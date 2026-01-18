import { createToken, verifyToken } from "./auth";

export default {
	async fetch(req, env, ctx) {
		const url = URL.parse(req.url);
		const path = url.pathname;
		const method = req.method;
		if (path == "/logins") {
			return new Response(JSON.stringify({
				message: "Login"
			}));

		} else if (path === "/signup" && method === "POST") {

			const body = await req.json();
			const { email, password, name } = body;

			const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
			const passwordHash = [...new Uint8Array(hash)]
				.map(b => b.toString(16).padStart(2, "0"))
				.join("");

			const id = crypto.randomUUID();

			await env.cldb.prepare(
				"INSERT INTO users (user_id, email, password, name) VALUES (?, ?, ?, ?)"
			).bind(id, email, passwordHash, name).run();

			return json({ success: true });

		} else if (path === "/login" && method === "POST") {
			const { email, password } = await req.json();

			const result = await env.cldb.prepare(
				"SELECT user_id, password, role FROM users WHERE email = ?"
			).bind(email).first();

			if (!result) return json({ error: "User not found" }, 401);

			// Hash incoming password
			const hash = await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode(password)
			);

			const passwordHash = [...new Uint8Array(hash)]
				.map(b => b.toString(16).padStart(2, "0"))
				.join("");

			if (passwordHash !== result.password)
				return json({ error: "Invalid password" }, 401);

			// 🔥 Update last_login
			await env.cldb.prepare(
				"UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?"
			).bind(result.user_id).run();

			const token = await createToken(
				{ user_id: result.user_id, role: result.role },
				env.JWT_SECRET
			);

			return json({ token });
		} else if (path == "/logout") {
			//logout to be done
			return json({ success: true });
		} else if (path == "/profile" && method == "GET") {
			const user = await requireAuth(req, env);
			if (!user) return json({ error: "Unauthorized" }, 401);

			const result = await env.cldb.prepare(
				"SELECT user_id, email, name, role FROM users WHERE user_id = ?"
			).bind(user.user_id).first();

			return json({ user: result });
		} else if (path == "/profile" && method == "PUT") {
			const user = await requireAuth(req, env);
			if (!user) return json({ error: "Unauthorized" }, 401);
			const { name } = await req.json();
			await env.cldb.prepare(
				"UPDATE users SET name = ? WHERE user_id = ?"
			).bind(name, user.user_id).run();
			return json({ success: true });
		} else if (path === "/video" && method === "GET") {

			const key = "courses/subjects/units/videos/song.mp4";

			const signedUrl = await env.files.createSignedUrl(
				key,
				60 * 60 // 1 hour
			);

			return json({ url: signedUrl });
		}

		return new Response("Hello World!");
	},
};

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json"
		}
	});
}

async function requireAuth(req, env) {
	const header = req.headers.get("Authorization");
	if (!header) return null;

	const token = header.replace("Bearer ", "");

	try {
		return await verifyToken(token, env.JWT_SECRET);
	} catch {
		return null;
	}
}