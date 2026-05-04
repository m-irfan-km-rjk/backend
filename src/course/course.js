import json from "../util/json";
import { requireAuth } from "../users/auth";
import { updateImage, uploadImage, deleteImage } from "../util/upload";
import { cleanupSubject } from "./subjects.js";

export async function coursesget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const subject_id = url.searchParams.get("subject_id");

    let query = "SELECT * FROM courses";
    const params = [];

    if (subject_id) {
        query += " WHERE subject_id = ?";
        params.push(subject_id);
    }

    const stmt = env.cldb.prepare(query);
    const result = params.length > 0
        ? await stmt.bind(...params).all()
        : await stmt.all();

    const courses = result.results;

    // 🔴 Edge case
    if (courses.length === 0) {
        return json({ courses: [] });
    }

    // 🧠 Get course IDs
    const courseIds = courses.map(c => c.course_id);
    const placeholders = courseIds.map(() => "?").join(",");

    // 1️⃣ Highlights
    const highlightsRes = await env.cldb.prepare(`
        SELECT course_id, highlight
        FROM course_highlights
        WHERE course_id IN (${placeholders})
    `).bind(...courseIds).all();

    // 2️⃣ Languages
    const languagesRes = await env.cldb.prepare(`
        SELECT course_id, language
        FROM course_languages
        WHERE course_id IN (${placeholders})
    `).bind(...courseIds).all();

    const educatorsRes = await env.cldb.prepare(`
    SELECT ce.course_id, e.id, e.name, e.qualification, e.image
    FROM course_educators ce
    JOIN educators e ON ce.educator_id = e.id
    WHERE ce.course_id IN (${placeholders})
`).bind(...courseIds).all();

    const educatorMap = {};

    for (const e of educatorsRes.results) {
        if (!educatorMap[e.course_id]) educatorMap[e.course_id] = [];

        educatorMap[e.course_id].push({
            name: e.name,
            qualification: e.qualification,
            image: e.image
        });
    }

    // 3️⃣ Maps
    const highlightMap = {};
    for (const h of highlightsRes.results) {
        if (!highlightMap[h.course_id]) highlightMap[h.course_id] = [];
        highlightMap[h.course_id].push(h.highlight);
    }

    const languageMap = {};
    for (const l of languagesRes.results) {
        if (!languageMap[l.course_id]) languageMap[l.course_id] = [];
        languageMap[l.course_id].push(l.language);
    }

    // 4️⃣ Attach to courses
    const finalCourses = courses.map(course => ({
        ...course,
        highlights: highlightMap[course.course_id] || [],
        languages: languageMap[course.course_id] || [],
        educators: educatorMap[course.course_id] || []
    }));

    return json({
        success: true,
        courses: finalCourses
    });
}

export async function coursespost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        let title = null,
            description = null,
            course_image = null,
            subtitle = null,
            language_tag = null,
            category_tag = null,
            duration = null,
            price = null,
            batch_start_date = null,
            enrollment_end_date = null,
            currency = "INR",
            highlights = [],
            languages = [],
            educators = [];

        const contentType = req.headers.get("Content-Type") || "";

        // 🟢 Handle multipart (image upload)
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            title = formData.get("title");
            description = formData.get("description");
            subtitle = formData.get("subtitle");
            language_tag = formData.get("language_tag");
            category_tag = formData.get("category_tag");

            duration = formData.get("duration") ? Number(formData.get("duration")) : null;
            price = formData.get("price") ? Number(formData.get("price")) : null;
            batch_start_date = formData.get("batch_start_date") || null;
            enrollment_end_date = formData.get("enrollment_end_date") || null;
            currency = formData.get("currency") || "INR";

            // 🔥 arrays (sent as JSON string from frontend)
            try {
                highlights = JSON.parse(formData.get("highlights") || "[]");
                languages = JSON.parse(formData.get("languages") || "[]");
                educators = JSON.parse(formData.get("educators") || "[]");
            } catch {
                highlights = [];
                languages = [];
                educators = [];
            }

            // 🖼️ image upload
            const file = formData.get("course_image");

            if (file instanceof File) {
                const uploaded = await uploadImage(file, env);
                course_image = uploaded.result.variants[0];
            }

        } else {
            // 🔵 JSON fallback
            const body = await req.json();

            title = body.title || null;
            description = body.description || null;
            course_image = body.course_image || null;
            subtitle = body.subtitle || null;
            language_tag = body.language_tag || null;
            category_tag = body.category_tag || null;

            duration = body.duration ?? null;
            price = body.price ?? null;
            batch_start_date = body.batch_start_date ?? null;
            enrollment_end_date = body.enrollment_end_date ?? null;
            currency = body.currency || "INR";

            highlights = body.highlights || [];
            languages = body.languages || [];
            educators = body.educators || [];
        }

        // 🔴 REQUIRED VALIDATION (UPDATED)
        if (!title || !description || !course_image) {
            return json({
                error: "title, description and course_image are required"
            }, 400);
        }

        const course_id = crypto.randomUUID();
        const created_at = new Date().toISOString();

        // 🚀 BATCH
        const batch = [];

        // 1️⃣ Insert course
        batch.push(
            env.cldb.prepare(`
                INSERT INTO courses (
                    course_id, title, description, course_image,
                    created_at, duration, price, subtitle,
                    language_tag, category_tag,
                    batch_start_date, enrollment_end_date, currency
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                course_id,
                title,
                description,
                course_image,
                created_at,
                duration,
                price,
                subtitle,
                language_tag,
                category_tag,
                batch_start_date,
                enrollment_end_date,
                currency
            )
        );

        // 2️⃣ Highlights
        if (Array.isArray(highlights) && highlights.length > 0) {
            for (const h of highlights) {
                batch.push(
                    env.cldb.prepare(`
                        INSERT INTO course_highlights (id, course_id, highlight)
                        VALUES (?, ?, ?)
                    `).bind(
                        crypto.randomUUID(),
                        course_id,
                        h
                    )
                );
            }
        }

        // 3️⃣ Languages
        if (Array.isArray(languages) && languages.length > 0) {
            for (const l of languages) {
                batch.push(
                    env.cldb.prepare(`
                        INSERT INTO course_languages (id, course_id, language)
                        VALUES (?, ?, ?)
                    `).bind(
                        crypto.randomUUID(),
                        course_id,
                        l
                    )
                );
            }
        }

        // 4️⃣ Educators
        if (Array.isArray(educators) && educators.length > 0) {
            for (const eId of educators) {
                batch.push(
                    env.cldb.prepare(`
                        INSERT INTO course_educators (course_id, educator_id)
                        VALUES (?, ?)
                    `).bind(
                        course_id,
                        eId
                    )
                );
            }
        }

        await env.cldb.batch(batch);

        return json({
            success: true,
            course_id,
            message: "Course created successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { id } = await req.json();

        // 1. Fetch course to get image
        const courseRow = await env.cldb
            .prepare("SELECT course_image FROM courses WHERE course_id = ?")
            .bind(id)
            .first();

        if (!courseRow) {
            return json({ error: "Course not found" }, 404);
        }

        // 2. Delete Course Image
        if (courseRow.course_image) {
            const imageId = courseRow.course_image.split("/").slice(-2, -1)[0];
            try {
                await deleteImage(imageId, env);
            } catch (e) {
                console.error(`Failed to delete course image for course ${id}:`, e);
            }
        }

        // 3. Get all Subjects
        const { results: subjects } = await env.cldb
            .prepare("SELECT subject_id FROM subjects WHERE course_id = ?")
            .bind(id)
            .all();

        // 4. Cleanup each subject (deletes units, videos, notes internally)
        for (const sub of subjects) {
            await cleanupSubject(sub.subject_id, env);
        }

        // 5. Delete Course Row
        await env.cldb.prepare(
            "DELETE FROM courses WHERE course_id = ?"
        ).bind(id).run();

        return json({ success: true, message: "Course deleted successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        let {
            course_id,
            title,
            description,
            course_image,
            subtitle,
            language_tag,
            category_tag,
            duration,
            price,
            batch_start_date,
            enrollment_end_date,
            currency,
            highlights,
            languages
        } = {};

        const contentType = req.headers.get("Content-Type") || "";

        // 🔵 MULTIPART
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            course_id = formData.get("course_id");
            title = formData.get("title");
            description = formData.get("description");
            subtitle = formData.get("subtitle");
            language_tag = formData.get("language_tag");
            category_tag = formData.get("category_tag");

            duration = formData.get("duration") ? Number(formData.get("duration")) : undefined;
            price = formData.get("price") ? Number(formData.get("price")) : undefined;
            batch_start_date = formData.get("batch_start_date");
            enrollment_end_date = formData.get("enrollment_end_date");
            currency = formData.get("currency");

            try { highlights = JSON.parse(formData.get("highlights")); } catch { }
            try { languages = JSON.parse(formData.get("languages")); } catch { }

            const existing = await env.cldb.prepare(
                "SELECT * FROM courses WHERE course_id = ?"
            ).bind(course_id).first();

            if (!existing) return json({ error: "Course not found" }, 404);

            const file = formData.get("course_image");

            if (file instanceof File) {
                const imageId = existing.course_image?.split("/").slice(-2, -1)[0];

                if (imageId) {
                    const updated = await updateImage(file, imageId, env);
                    course_image = updated.imageUrl;
                } else {
                    const uploaded = await uploadImage(file, env);
                    course_image = uploaded.result.variants[0];
                }
            } else {
                course_image = existing.course_image;
            }

        } else {
            const body = await req.json();
            ({
                course_id,
                title,
                description,
                course_image,
                subtitle,
                language_tag,
                category_tag,
                duration,
                price,
                batch_start_date,
                enrollment_end_date,
                currency,
                highlights,
                languages
            } = body);
        }

        if (!course_id) {
            return json({ error: "course_id is required" }, 400);
        }

        const existing = await env.cldb.prepare(
            "SELECT * FROM courses WHERE course_id = ?"
        ).bind(course_id).first();

        if (!existing) {
            return json({ error: "Course not found" }, 404);
        }

        const batch = [];

        // 🔥 1. Dynamic UPDATE
        const fields = [];
        const values = [];

        const map = {
            title, description, course_image, subtitle,
            language_tag, category_tag, duration,
            price, batch_start_date, enrollment_end_date, currency
        };

        for (const [key, value] of Object.entries(map)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length > 0) {
            batch.push(
                env.cldb.prepare(`
                    UPDATE courses SET ${fields.join(", ")}
                    WHERE course_id = ?
                `).bind(...values, course_id)
            );
        }

        // 🔥 2. Highlights
        if (Array.isArray(highlights)) {
            batch.push(
                env.cldb.prepare(
                    "DELETE FROM course_highlights WHERE course_id = ?"
                ).bind(course_id)
            );

            for (const h of highlights) {
                batch.push(
                    env.cldb.prepare(`
                        INSERT INTO course_highlights (id, course_id, highlight)
                        VALUES (?, ?, ?)
                    `).bind(crypto.randomUUID(), course_id, h)
                );
            }
        }

        // 🔥 3. Languages
        if (Array.isArray(languages)) {
            batch.push(
                env.cldb.prepare(
                    "DELETE FROM course_languages WHERE course_id = ?"
                ).bind(course_id)
            );

            for (const l of languages) {
                batch.push(
                    env.cldb.prepare(`
                        INSERT INTO course_languages (id, course_id, language)
                        VALUES (?, ?, ?)
                    `).bind(crypto.randomUUID(), course_id, l)
                );
            }
        }

        // ✅ EXECUTE (atomic in D1)
        if (batch.length > 0) {
            await env.cldb.batch(batch);
        }

        return json({
            success: true,
            message: "Course updated successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function educatorspost(req, env) {
    const user = await requireAuth(req, env);
    if (!user || user.role != "admin") return json({ error: "Unauthorized" }, 401);
    try {
        const contentType = req.headers.get("Content-Type") || "";

        let name = null;
        let qualification = null;
        let image = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            name = formData.get("name");
            qualification = formData.get("qualification");

            const file = formData.get("image");

            if (file instanceof File) {
                const uploaded = await uploadImage(file, env);
                image = uploaded.result.variants[0];
            }

        } else {
            const body = await req.json();
            ({ name, qualification, image } = body);
        }

        if (!name) {
            return json({ error: "name is required" }, 400);
        }

        const result = await env.cldb.prepare(`
            INSERT INTO educators (name, qualification, image)
            VALUES (?, ?, ?)
        `).bind(name, qualification, image).run();

        return json({
            success: true,
            educator_id: result.meta.last_row_id
        });

    } catch (e) {
        return json({ error: e.message }, 500);
    }
}

export async function educatorsget(req, env) {
    try {
        const res = await env.cldb.prepare(`
            SELECT id, name, qualification, image
            FROM educators
            ORDER BY id DESC
        `).all();

        return json({
            success: true,
            educators: res.results
        });

    } catch (e) {
        return json({ error: e.message }, 500);
    }
}

export async function educatorsgetone(req, env) {
    try {
        const url = new URL(req.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response("id required", { status: 400 });
        }

        const educator = await env.cldb.prepare(`
            SELECT id, name, qualification, image
            FROM educators
            WHERE id = ?
        `).bind(id).first();

        if (!educator) {
            return new Response("Not found", { status: 404 });
        }

        return json({
            success: true,
            educator
        });

    } catch (e) {
        return json({ error: e.message }, 500);
    }
}

export async function educatorsput(req, env) {
    try {
        const contentType = req.headers.get("Content-Type") || "";

        let id, name, qualification, image;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            id = formData.get("id");
            name = formData.get("name");
            qualification = formData.get("qualification");

            const existing = await env.cldb.prepare(`
                SELECT image FROM educators WHERE id = ?
            `).bind(id).first();

            if (!existing) {
                return json({ error: "Educator not found" }, 404);
            }

            const file = formData.get("image");

            if (file instanceof File) {
                const uploaded = await uploadImage(file, env);
                image = uploaded.result.variants[0];
            } else {
                image = existing.image;
            }

        } else {
            const body = await req.json();
            ({ id, name, qualification, image } = body);
        }

        if (!id) {
            return json({ error: "id required" }, 400);
        }

        const fields = [];
        const values = [];

        if (name !== undefined) {
            fields.push("name = ?");
            values.push(name);
        }

        if (qualification !== undefined) {
            fields.push("qualification = ?");
            values.push(qualification);
        }

        if (image !== undefined) {
            fields.push("image = ?");
            values.push(image);
        }

        if (fields.length === 0) {
            return json({ error: "Nothing to update" }, 400);
        }

        await env.cldb.prepare(`
            UPDATE educators
            SET ${fields.join(", ")}
            WHERE id = ?
        `).bind(...values, id).run();

        return json({
            success: true,
            message: "Educator updated"
        });

    } catch (e) {
        return json({ error: e.message }, 500);
    }
}

export async function educatorsdelete(req, env) {
    try {
        const { id } = await req.json();

        if (!id) {
            return new Response("id required", { status: 400 });
        }

        // optional: get image for deletion
        const existing = await env.cldb.prepare(`
            SELECT image FROM educators WHERE id = ?
        `).bind(id).first();

        if (!existing) {
            return new Response("Not found", { status: 404 });
        }

        await deleteImage(existing.image, env);

        // delete DB
        await env.cldb.prepare(`
            DELETE FROM educators WHERE id = ?
        `).bind(id).run();

        // optional: delete image from storage
        // (depends on how your upload util works)

        return json({
            success: true,
            message: "Educator deleted"
        });

    } catch (e) {
        return json({ error: e.message }, 500);
    }
}