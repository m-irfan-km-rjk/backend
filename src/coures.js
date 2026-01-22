import json from "./json";
import { requireAuth } from "./auth";

export async function coursesget(req, env, url) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM courses"
    ).all();

    return json({ courses: result.results });
}
export async function coursespost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    //if (user.role !== "admin") return json({ error: "Unauthorized" }, 401);
    const { title, description, course_image } = await req.json();
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO courses (course_id, title, description, course_image, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, title, description, course_image, created_at).run();
    return json({ success: true, message: "Course created successfully" });
}

export async function coursesdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM courses WHERE title = ?"
    ).bind(title).run();
    return json({ success: true, message: "Course deleted successfully" });
}

