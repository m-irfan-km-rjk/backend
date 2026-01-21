import json from "./json";
import { requireAuth } from "./auth";

const adminusersget = async (req, env) => {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM users"
    ).all();
    return json({ users: result.results });
}
const updateusers = async (req, env) => {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "Unauthorized" }, 401);
    const { user_id, name, email, role } = await req.json();
    await env.cldb.prepare(
        "UPDATE users SET name = ?, email = ?, role = ? WHERE user_id = ?"
    ).bind(name, email, role, user_id).run();
    return json({ success: true, message: "User updated successfully" });
}

const deleteusers = async (req, env) => {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "Unauthorized" }, 401);
    const { user_id } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM users WHERE user_id = ?"
    ).bind(user_id).run();
    return json({ success: true, message: "User deleted successfully" });
}

export { adminusersget, updateusers, deleteusers };