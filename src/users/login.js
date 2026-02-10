import json from "../util/json";
import { createToken, verifyToken } from "./auth";

export default async function login(req, env) {
    const { email, password } = await req.json();

    const result = await env.cldb.prepare(
        "SELECT user_id, password, role FROM users WHERE email = ?"
    ).bind(email).first();

    if (!result) return json({ error: "User not found" }, 401);

    if (password !== result.password)
        return json({ error: "Invalid password" }, 401);

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