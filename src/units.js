import json from "./json";
import { requireAuth } from "./auth";

export async function unitsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM units"
    ).all();
    return json({ units: result.results });
}
export async function unitspost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title, unit_image, subject_id } = await req.json();
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO units (unit_id, title, unit_image, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, title, unit_image, subject_id, created_at).run();
    return json({ success: true, message: "Unit created successfully"+title });
}
export async function unitsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM units WHERE title = ?"
    ).bind(title).run();
    return json({ success: true, message: "Unit deleted successfully" });
}