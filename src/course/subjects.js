import json from "../util/json";
import {updateImage, uploadImage, deleteImage }from "../util/upload";
import { requireAuth } from "../users/auth";

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
    const { id } = await req.json();
    const subjectRow = await env.cldb
        .prepare(
            "SELECT subject_image FROM subjects WHERE subject_id = ?"
        )
        .bind(id)
        .first();

    if (!subjectRow) {
        return json({ error: "Subject not found" }, 404);
    }

    await deleteImage(subjectRow.subject_image, env);

    await env.cldb.prepare(
        "DELETE FROM subjects WHERE subject_id = ?"
    ).bind(id).run();
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
        if (file instanceof File) {
            subject_image = await uploadImage(file, env);
            subject_image = subject_image.result.variants[0];
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

export async function subjectsput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        let subject_id, title, subject_image;
        const contentType = req.headers.get("Content-Type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            subject_id = formData.get("subject_id");
            title = formData.get("title");
            const file = formData.get("subject_image");
             const subjectRow = await env.cldb
                    .prepare("SELECT course_id FROM subjects WHERE subject_id = ?")
                    .bind(subject_id)
                    .first();

            if (file instanceof File) {
                // We need course_id to build the path
               

                const subjectRow = await env.cldb
                    .prepare("SELECT course_id FROM subjects WHERE subject_id = ?")
                    .bind(subject_id)
                    .first();

                if (!subjectRow) {
                    return json({ error: "Subject not found" }, 404);
                }
                const course_id = subjectRow.course_id;
                 const updated = await updateImage(file, subjectRow.subject_image.split("/")[subjectRow.subject_image.split("/").length - 2], env);
                 subject_image = updated.imageUrl;
            } else {
                subject_image = subjectRow.subject_image;
            }
        } else {
            const body = await req.json();
            subject_id = body.subject_id;
            title = body.title;
            subject_image = body.subject_image;
        }

        if (!subject_id) {
            return json({ error: "subject_id is required" }, 400);
        }

        await env.cldb.prepare(
            "UPDATE subjects SET title = ?, subject_image = ? WHERE subject_id = ?"
        ).bind(title, subject_image, subject_id).run();
        return json({ success: true, message: "Subject updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}
