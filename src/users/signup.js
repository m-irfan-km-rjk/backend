import json from "../util/json";
import { hashPassword } from "../util/hash";

export default async function signup(req, env) {
    const body = await req.json();

    if (!body.email || !body.password || !body.name) {
        return json({ success: false, message: "Missing fields" }, 400);
    }

    const { email, password, name, role = "student" } = body;

    const id = crypto.randomUUID();

    // 🔐 hash password
    const hashedPassword = await hashPassword(password);

    const image = `https://ui-avatars.com/api/?name=${name.replaceAll(" ", "+")}&background=random&color=random`;

    try {
        await env.cldb.prepare(
            "INSERT INTO users (user_id, email, password, name, role, image) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, email, hashedPassword, name, role, image).run();
    } catch (error) {
        return json({ success: false, message: error.message }, 400);
    }

    return json({
        success: true,
        message: "User created successfully " + name
    }, 201);
}