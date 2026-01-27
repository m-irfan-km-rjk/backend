import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage } from "../util/upload";

export async function unitsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const subject_id = url.searchParams.get("subject_id");

    let query = "SELECT * FROM units";
    const params = [];

    if (subject_id) {
        query += " WHERE subject_id = ?";
        params.push(subject_id);
    }

    const stmt = env.cldb.prepare(query);
    const result = subject_id ? await stmt.bind(...params).all() : await stmt.all();

    return json({ units: result.results });
}
export async function unitspost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const unit_id = crypto.randomUUID();

        let title, unit_image, subject_id;
        const contentType = req.headers.get("Content-Type") || "";
        let file = null;

        /* -----------------------------
           Parse request
        ------------------------------ */
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            title = formData.get("title");
            subject_id = formData.get("subject_id");
            file = formData.get("unit_image");
        } else {
            const body = await req.json();
            title = body.title;
            subject_id = body.subject_id;
            unit_image = body.unit_image;
        }

        /* -----------------------------
           ✅ VALIDATE subject_id
           + get course_id
        ------------------------------ */
        const subjectRow = await env.cldb
            .prepare(
                "SELECT course_id FROM subjects WHERE subject_id = ? LIMIT 1"
            )
            .bind(subject_id)
            .first();

        if (!subjectRow) {
            return json(
                { error: "Invalid subject_id. Subject does not exist." },
                400
            );
        }

        const course_id = subjectRow.course_id;

        /* -----------------------------
           ✅ UPLOAD IMAGE (only after validation)
        ------------------------------ */
        if (file instanceof File) {
            unit_image = await uploadFileToStorage(
                file,
                `courses/${course_id}/subjects/${subject_id}/units/${unit_id}`,
                "thumbnail",
                env
            );
        }

        const created_at = new Date().toISOString();

        /* -----------------------------
           Insert into DB
        ------------------------------ */
        await env.cldb.prepare(
            `INSERT INTO units 
             (unit_id, title, unit_image, subject_id, created_at) 
             VALUES (?, ?, ?, ?, ?)`
        ).bind(
            unit_id,
            title,
            unit_image,
            subject_id,
            created_at
        ).run();

        return json({
            success: true,
            message: "Unit created successfully",
            unit_id
        });

    } catch (e) {
        return json({ error: e.message || e }, 500);
    }
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