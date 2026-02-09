import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage } from "../util/upload";

export async function subjectsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const course_id = url.searchParams.get("course_id");

    let query = "SELECT * FROM subjects";
    const params = [];

    if (course_id) {
        query += " WHERE course_id = ?";
        params.push(course_id);
    }

    const stmt = env.cldb.prepare(query);
    const result = course_id ? await stmt.bind(...params).all() : await stmt.all();

    return json({ subjects: result.results });
}
export async function subjectsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { subject_id } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM subjects WHERE subject_id = ?"
    ).bind(title).run();
    return json({ success: true, message: "Subject deleted successfully" });
}

export async function subjectspost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const subject_id = crypto.randomUUID();

        let title, subject_image, course_id;
        const contentType = req.headers.get("Content-Type") || "";

        let file = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            title = formData.get("title");
            course_id = formData.get("course_id");
            file = formData.get("subject_image");
        } else {
            const body = await req.json();
            title = body.title;
            course_id = body.course_id;
            subject_image = body.subject_image;
        }

        /* -----------------------------
           ✅ VALIDATE course_id FIRST
        ------------------------------ */
        const courseCheck = await env.cldb
            .prepare("SELECT 1 FROM courses WHERE course_id = ? LIMIT 1")
            .bind(course_id)
            .first();

        if (!courseCheck) {
            return json(
                { error: "Invalid course_id. Course does not exist." },
                400
            );
        }

        /* -----------------------------
           ✅ UPLOAD IMAGE (only if valid)
        ------------------------------ */
        if (file instanceof File) {
            subject_image = await uploadFileToStorage(
                file,
                `courses/${course_id}/subjects/${subject_id}`,
                "thumbnail",
                env
            );
        }

        const created_at = new Date().toISOString();

        await env.cldb.prepare(
            `INSERT INTO subjects 
             (subject_id, title, subject_image, course_id, created_at) 
             VALUES (?, ?, ?, ?, ?)`
        ).bind(
            subject_id,
            title,
            subject_image,
            course_id,
            created_at
        ).run();

        return json({
            success: true,
            message: "Subject created successfully",
            subject_id
        });

    } catch (e) {
        return json({ error: e.message || e }, 500);
    }
}
