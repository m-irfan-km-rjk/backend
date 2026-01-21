import json from "./json";
import { requireAuth } from "./auth";

export async function subjectsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM subjects"
    ).all();
    return json({ subjects: result.results });
}
export async function subjectsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM subjects WHERE title = ?"
    ).bind(title).run();
    return json({ success: true, message: "Subject deleted successfully" });
}

export async function subjectspost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title, subject_image, course_id } = await req.json();
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO subjects (subject_id, title, subject_image, course_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, title, subject_image, course_id, created_at).run();
    return json({ success: true, message: "Subject created successfully" });
}
