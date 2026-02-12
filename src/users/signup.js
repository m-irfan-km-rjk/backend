import json from "../util/json";

export default async function signup(req, env) {

    const body = await req.json();
    const { email, password, name, role } = body;

    const id = crypto.randomUUID();

    try {
        await env.cldb.prepare(
            "INSERT INTO users (user_id, email, password, name, role, image) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, email, password, name, role, "https://ui-avatars.com/api/?name=" + name.replaceAll(" ", "+") + "&background=random&color=random").run();
    } catch (error) {
        return json({ success: false, message: error.message }, 400);
    }

    return json({ success: true, message: "User created successfully " + name }, 201);
}