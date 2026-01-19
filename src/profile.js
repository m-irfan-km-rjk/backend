import json from "./json";
import { requireAuth } from "./auth";

export async function profileget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const result = await env.cldb.prepare(
        "SELECT user_id, email, name, role FROM users WHERE user_id = ?"
    ).bind(user.user_id).first();

    return json({ user: result });
}
export async function profileput(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);


    const { name } = await req.json();
    await env.cldb.prepare(
        "UPDATE users SET name = ? WHERE user_id = ?"
    ).bind(name, user.user_id).run();
    return json({ success: true, message: "Profile updated successfully" });
}
