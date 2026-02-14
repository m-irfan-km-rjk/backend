import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage, deleteFileFromStorage } from "../util/upload";

export async function unitsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const subject_id = url.searchParams.get("subject_id");
    const course_id = url.searchParams.get("course_id");

    let query = "SELECT * FROM units";
    const params = [];

    if (subject_id) {
        query += " WHERE subject_id = ?";
        params.push(subject_id);
    } else if (course_id) {
        query += " WHERE course_id = ?";
        params.push(course_id);
    }

    const stmt = env.cldb.prepare(query);
    const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

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
            unit_image = await uploadImage(file, env);
            unit_image = unit_image.result.variants[0];
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
    const { id } = await req.json();

    const unitRow = await env.cldb
        .prepare(
            "SELECT unit_image FROM units WHERE unit_id = ?"
        )
        .bind(id)
        .first();

    if (!unitRow) {
        return json({ error: "Unit not found" }, 404);
    }
    else{
         await deleteImage(unitRow.unit_image, env);
    }

    await env.cldb.prepare(
        "DELETE FROM units WHERE unit_id = ?"
    ).bind(id).run();
    return json({ success: true, message: "Unit deleted successfully" });
}

export async function unitsput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        let unit_id, title, unit_image;
        const contentType = req.headers.get("Content-Type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            unit_id = formData.get("unit_id");
            title = formData.get("title");
            const file = formData.get("unit_image");

            if (file instanceof File) {
                // Fetch IDs needed for path
                const unitRow = await env.cldb
                    .prepare(`
                        SELECT u.subject_id, s.course_id 
                        FROM units u 
                        JOIN subjects s ON u.subject_id = s.subject_id 
                        WHERE u.unit_id = ?
                    `)
                    .bind(unit_id)
                    .first();

                if (!unitRow) {
                    return json({ error: "Unit not found" }, 404);
                }
                const { subject_id, course_id } = unitRow;

                unit_image = await updateImage(file, unitRow.unit_image, env);
                unit_image = unit_image.result.variants[0];
            } else {
                unit_image = file;
            }
        } else {
            const body = await req.json();
            unit_id = body.unit_id;
            title = body.title;
            unit_image = body.unit_image;
        }

        if (!unit_id) {
            return json({ error: "unit_id is required" }, 400);
        }

        await env.cldb.prepare(
            "UPDATE units SET title = ?, unit_image = ? WHERE unit_id = ?"
        ).bind(title, unit_image, unit_id).run();
        return json({ success: true, message: "Unit updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsvideoupdate(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { unit_id, video_id, title, description } = await req.json();

        await env.cldb.prepare(
            `INSERT INTO videos 
             (unit_id, title, video_id, description, created_at)
             VALUES (?, ?, ?, ?, ?)`
        ).bind(
            unit_id,
            title,
            video_id,
            description,
            new Date().toISOString()
        ).run();

        return json({ success: true, message: "Video updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsvideosget(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const unit_id = url.searchParams.get("unit_id");

        if (!unit_id) {
            return json({ error: "unit_id is required" }, 400);
        }

        const { results: videos } = await env.cldb
            .prepare(
                `SELECT * FROM videos
                 WHERE unit_id = ?
                 ORDER BY position ASC`
            )
            .bind(unit_id)
            .all();

        // 🔁 Iterate non-final videos
        for (const video of videos) {
            if (video.status === "ready" || video.status === "failed") {
                continue;
            }

            // 🔍 Ask Cloudflare Stream for truth
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${video.video_id}`,
                {
                    headers: {
                        Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`
                    }
                }
            );

            const data = await res.json();

            if (!data.success || !data.result?.status?.state) {
                continue;
            }

            const state = data.result.status.state;

            // ✅ READY
            if (state === "ready") {
                const videoUrl = data.result.playback?.hls;
                const thumbnailUrl = data.result.thumbnail;
                const duration = data.result.duration;

                await env.cldb
                    .prepare(
                        `UPDATE videos
             SET status = ?, video_url = ?, thumbnail_url = ?, duration = ?
             WHERE video_id = ?`
                    )
                    .bind("ready", videoUrl, thumbnailUrl, duration, video.video_id)
                    .run();

                // Update in-memory object for response
                video.status = "ready";
                video.video_url = videoUrl;
                video.thumbnail_url = thumbnailUrl;
                video.duration = duration;
            }

            // ❌ FAILED
            else if (state === "failed") {
                await env.cldb
                    .prepare(
                        `UPDATE videos
             SET status = ?
             WHERE video_id = ?`
                    )
                    .bind("failed", video.video_id)
                    .run();

                video.status = "failed";
            }

            // ⏳ still uploading / processing → do nothing
        }

        return json({ videos });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotesget(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const unit_id = url.searchParams.get("unit_id");

        if (!unit_id) {
            return json({ error: "unit_id is required" }, 400);
        }

        const notes = await env.cldb.prepare(
            "SELECT * FROM notes WHERE unit_id = ?"
        ).bind(unit_id).all();

        return json({ notes: notes.results });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotespost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { unit_id, title, note } = await req.json();

        await env.cldb.prepare(
            `INSERT INTO notes 
             (unit_id, title, note, created_at)
             VALUES (?, ?, ?, ?)`
        ).bind(
            unit_id,
            title,
            note,
            new Date().toISOString()
        ).run();

        return json({ success: true, message: "Note created successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotesdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { note_id } = await req.json();

        await env.cldb.prepare(
            "DELETE FROM notes WHERE note_id = ?"
        ).bind(note_id).run();

        return json({ success: true, message: "Note deleted successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotesput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { note_id, title, note } = await req.json();

        await env.cldb.prepare(
            "UPDATE notes SET title = ?, note = ? WHERE note_id = ?"
        ).bind(title, note, note_id).run();

        return json({ success: true, message: "Note updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}