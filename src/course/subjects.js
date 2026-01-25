import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage } from "../util/upload";

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

    let title, subject_image, course_id;
    const contentType = req.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        title = formData.get("title");
        course_id = formData.get("course_id");
        const file = formData.get("subject_image");
        if (file && file instanceof File) {
            subject_image = await uploadFileToStorage(file, "subject-images", env);
        } else {
            subject_image = file;
        }
    } else {
        const body = await req.json();
        title = body.title;
        course_id = body.course_id;
        subject_image = body.subject_image;
    }

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO subjects (subject_id, title, subject_image, course_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, title, subject_image, course_id, created_at).run();
    return json({ success: true, message: "Subject created successfully" });
}
