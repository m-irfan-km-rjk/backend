import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadImage, updateImage, deleteImage } from "../util/upload";

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

    if (unitRow.unit_image) {
        const imageId = unitRow.unit_image.split("/").slice(-2, -1)[0];
        await deleteImage(imageId, env);
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

                const currentImageId = unitRow.unit_image ? unitRow.unit_image.split("/").slice(-2, -1)[0] : null;
                const updated = await updateImage(file, currentImageId, env);
                unit_image = updated.imageUrl;
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


//Remove this if unnecessary
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

        const formData = await req.formData();

        const unit_id = formData.get("unit_id");
        const title = formData.get("title");
        const file = formData.get("file");

        if (!unit_id || !title) {
            return json({ error: "unit_id and title are required" }, 400);
        }

        // Validate unit relationship
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

        let file_path = null;
        let mime_type = null;
        let file_size = null;

        // Upload file if provided
        if (file && file instanceof File) {

            const safeTitle = title.replace(/[^a-zA-Z0-9-_]/g, "_");

            // get extension
            const ext = file.name.includes(".")
                ? file.name.split(".").pop()
                : "";

            file_path =
                `courses/${course_id}/subjects/${subject_id}/units/${unit_id}/notes/${safeTitle}_${Date.now()}${ext ? "." + ext : ""}`;

            mime_type = file.type || "application/octet-stream";
            file_size = file.size;

            await env.files.put(
                file_path,
                await file.arrayBuffer(),
                {
                    httpMetadata: {
                        contentType: mime_type,
                    },
                }
            );
        }

        const now = new Date().toISOString();

        // Insert into DB (ONLY your existing columns)
        await env.cldb.prepare(`
            INSERT INTO notes (
                unit_id,
                title,
                file_path,
                mime_type,
                file_size,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            unit_id,
            title,
            "https://media.crescentlearning.org/" + file_path,
            mime_type,
            file_size,
            now
        ).run();

        return json({
            success: true,
            message: "Note created successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotesdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { note_id } = await req.json();

        if (!note_id) {
            return json({ error: "note_id required" }, 400);
        }

        // Get note first
        const note = await env.cldb
            .prepare("SELECT file_path FROM notes WHERE note_id = ?")
            .bind(note_id)
            .first();

        if (!note) {
            return json({ error: "Note not found" }, 404);
        }

        // Delete file from R2 (if exists)
        if (note.file_path) {
            const objectKey = note.file_path.replace(
                "https://media.crescentlearning.org/",
                ""
            );

            await env.files.delete(objectKey);
        }

        // Delete from DB
        await env.cldb.prepare(
            "DELETE FROM notes WHERE note_id = ?"
        ).bind(note_id).run();

        return json({
            success: true,
            message: "Note deleted successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function unitsnotesput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const formData = await req.formData();

        const note_id = formData.get("note_id");
        const title = formData.get("title"); // optional
        const file = formData.get("file");   // optional

        if (!note_id) {
            return json({ error: "note_id required" }, 400);
        }

        // Get existing note
        const existing = await env.cldb
            .prepare("SELECT * FROM notes WHERE note_id = ?")
            .bind(note_id)
            .first();

        if (!existing) {
            return json({ error: "Note not found" }, 404);
        }

        // Start with existing values
        let newTitle = title || existing.title;
        let file_path = existing.file_path;
        let mime_type = existing.mime_type;
        let file_size = existing.file_size;

        // If new file provided → replace file
        if (file && file instanceof File) {

            // delete old file (optional but recommended)
            if (existing.file_path) {
                const oldKey = existing.file_path.replace(
                    "https://media.crescentlearning.org/",
                    ""
                );
                await env.files.delete(oldKey);
            }

            const safeTitle = newTitle.replace(/[^a-zA-Z0-9-_]/g, "_");

            const ext = file.name.includes(".")
                ? file.name.split(".").pop()
                : "";

            const newKey =
                `notes/${note_id}_${Date.now()}${ext ? "." + ext : ""}`;

            mime_type = file.type || "application/octet-stream";
            file_size = file.size;

            await env.files.put(
                newKey,
                await file.arrayBuffer(),
                {
                    httpMetadata: {
                        contentType: mime_type,
                    },
                }
            );

            file_path = `https://media.crescentlearning.org/${newKey}`;
        }

        // If user sent nothing to update
        if (!title && !file) {
            return json({ error: "Nothing to update" }, 400);
        }

        // Update DB
        await env.cldb.prepare(`
            UPDATE notes
            SET title = ?, file_path = ?, mime_type = ?, file_size = ?
            WHERE note_id = ?
        `).bind(
            newTitle,
            file_path,
            mime_type,
            file_size,
            note_id
        ).run();

        return json({
            success: true,
            message: "Note updated successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function deleteStreamVideo(videoUid, env) {
    const url =
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${videoUid}`;

    const res = await fetch(url, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
        },
    });

    if (!res.ok) {
        const errText = await res.text();
        console.log("Stream delete failed:", errText);
    }

    return res.ok;
}