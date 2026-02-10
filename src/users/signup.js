import json from "../util/json";

export default async function signup(req, env) {

    const body = await req.json();
    const { email, password, name, role } = body;

    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const passwordHash = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");

    const id = crypto.randomUUID();

    try {
        await env.cldb.prepare(
            "INSERT INTO users (user_id, email, password, name, role, image) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, email, passwordHash, name, role, "https://ui-avatars.com/api/?name=" + name.replaceAll(" ", "+") + "&background=random&color=random").run();
    } catch (error) {
        return json({ success: false, message: error.message }, 400);
    }

    return json({ success: true, message: "User created successfully " + name }, 201);
}