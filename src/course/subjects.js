import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadImage, deleteImage, updateImage } from "../util/upload";
import { deleteStreamVideo } from "./units";

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

export async function cleanupSubject(subject_id, env) {
    // ---------- SUBJECT CHECK ----------
    const subjectRow = await env.cldb
        .prepare("SELECT subject_image FROM subjects WHERE subject_id = ?")
        .bind(subject_id)
        .first();

    if (!subjectRow) {
        // If subject doesn't exist, nothing to clean up. Return false or similar.
        // Or just return, implying success (idempotent).
        return;
    }

    // ---------- DELETE SUBJECT IMAGE ----------
    if (subjectRow.subject_image) {
        const imageId = subjectRow.subject_image.split("/").slice(-2, -1)[0];
        try {
            await deleteImage(imageId, env);
        } catch (e) {
            console.error(`Failed to delete subject image ${imageId}:`, e);
        }
    }

    // ---------- GET ALL UNIT IDS ----------
    const { results: units } = await env.cldb
        .prepare("SELECT unit_id FROM units WHERE subject_id = ?")
        .bind(subject_id)
        .all();

    const unitIds = units.map(u => u.unit_id);

    if (unitIds.length > 0) {

        // ---------- DELETE NOTE FILES ----------
        const placeholders = unitIds.map(() => "?").join(",");

        const { results: notes } = await env.cldb
            .prepare(
                `SELECT file_path FROM notes 
                 WHERE unit_id IN (${placeholders})`
            )
            .bind(...unitIds)
            .all();

        for (const n of notes) {
            if (n.file_path) {
                const key = n.file_path.replace(
                    "https://media.crescentlearning.org/",
                    ""
                );
                try {
                    await env.files.delete(key);
                } catch (e) {
                    console.error(`Failed to delete note file ${key}:`, e);
                }
            }
        }

        // ---------- DELETE VIDEOS FROM STREAM ----------
        const { results: videos } = await env.cldb
            .prepare(
                `SELECT video_id FROM videos
                 WHERE unit_id IN (${placeholders})`
            )
            .bind(...unitIds)
            .all();

        for (const v of videos) {
            if (v.video_id) {
                try {
                    await deleteStreamVideo(v.video_id, env);
                } catch (e) {
                    console.error(`Failed to delete stream video ${v.video_id}:`, e);
                }
            }
        }

        // ---------- DELETE NOTES ROWS ----------
        await env.cldb.prepare(
            `DELETE FROM notes WHERE unit_id IN (${placeholders})`
        ).bind(...unitIds).run();

        // ---------- DELETE VIDEOS ROWS ----------
        await env.cldb.prepare(
            `DELETE FROM videos WHERE unit_id IN (${placeholders})`
        ).bind(...unitIds).run();

        // ---------- DELETE UNITS IMAGES ----------
        // We should also delete unit images before deleting unit rows.
        // It wasn't in original code explicitly, but requirements start "Implement DELETE logic... clean everything".
        // Let's fetch unit images.
        const { results: unitsWithImages } = await env.cldb
            .prepare(`SELECT unit_image FROM units WHERE unit_id IN (${placeholders}) AND unit_image IS NOT NULL`)
            .bind(...unitIds)
            .all();

        for (const u of unitsWithImages) {
            if (u.unit_image) {
                const uImgId = u.unit_image.split("/").slice(-2, -1)[0];
                try {
                    await deleteImage(uImgId, env);
                } catch (e) {
                    console.error("Failed to delete unit image", e);
                }
            }
        }
    }

    // ---------- DELETE UNITS ----------
    await env.cldb
        .prepare("DELETE FROM units WHERE subject_id = ?")
        .bind(subject_id)
        .run();

    // ---------- DELETE SUBJECT ----------
    await env.cldb
        .prepare("DELETE FROM subjects WHERE subject_id = ?")
        .bind(subject_id)
        .run();
}

export async function subjectsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { id } = await req.json(); // subject_id

    // Check if subject exists (for 404 response compliance)
    const exists = await env.cldb.prepare("SELECT 1 FROM subjects WHERE subject_id = ?").bind(id).first();
    if (!exists) {
        return json({ error: "Subject not found" }, 404);
    }

    await cleanupSubject(id, env);

    return json({
        success: true,
        message: "Subject deleted successfully"
    });
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

                const currentImageId = subjectRow.subject_image ? subjectRow.subject_image.split("/").slice(-2, -1)[0] : null;
                const updated = await updateImage(file, currentImageId, env);
                subject_image = updated.imageUrl;
            } else {
                subject_image = file;
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
