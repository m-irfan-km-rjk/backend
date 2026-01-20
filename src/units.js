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
export async function unitsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM units WHERE title = ?"
    ).bind(title).run();
    return json({ success: true, message: "Unit deleted successfully" });
}