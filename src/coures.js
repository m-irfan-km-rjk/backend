import json from "./json";
import { requireAuth } from "./auth";

export async function coursesget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM courses"
    ).all();

    return json({ courses: result });
}
export async function coursespost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    //if (user.role !== "admin") return json({ error: "Unauthorized" }, 401);
    const { title, description } = await req.json();
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO courses (course_id, title, description, created_at) VALUES (?, ?, ?, ?)"
    ).bind(id, title, description, created_at).run();
    return json({ success: true, message: "Course created successfully" });
}
