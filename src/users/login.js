import json from "../util/json";
import { createToken, verifyToken } from "./auth";
import { hashPassword } from "../util/hash"

export default async function login(req, env) {
    const body = await req.json();

    if (!body.email || !body.password) {
        return json({ error: "Email and password required" }, 400);
    }

    const email = body.email;
    const password = body.password;

    const result = await env.cldb.prepare(
        "SELECT user_id, password, role, name FROM users WHERE email = ?"
    ).bind(email).first();

    if (!result) return json({ error: "User not found" }, 401);

    // 🔐 hash incoming password
    const hashedInput = await hashPassword(password);

    if (hashedInput !== result.password) {
        return json({ error: "Invalid password" }, 401);
    }

    // 🔥 Update last_login
    await env.cldb.prepare(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(result.user_id).run();

    const token = await createToken(
        { user_id: result.user_id, role: result.role, name: result.name },
        env.JWT_SECRET
    );

    return json({ token });
}