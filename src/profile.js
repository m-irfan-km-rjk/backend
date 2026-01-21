import json from "./json";
import { requireAuth } from "./auth";

export async function profileget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const result = await env.cldb.prepare(
        "SELECT * FROM users WHERE user_id = ?"
    ).bind(user.user_id).first();

    return json({ user: result });
}
export async function profileput(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const { name, role, email, phone } = body;
    await env.cldb.prepare(
        "UPDATE users SET name = ?, role = ?, email = ?, phone = ? WHERE user_id = ?"
    ).bind(name, role, email, phone, user.user_id).run();
    return json({ success: true, message: "Profile updated successfully" });
}
