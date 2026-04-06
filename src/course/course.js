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
        languages: languageMap[course.course_id] || []
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
            duration,
            price,
            batch_start_date,
            enrollment_end_date = null,
            currency = "INR",
            highlights = [],
            languages = [];

        const contentType = req.headers.get("Content-Type") || "";

        // 🟢 Handle multipart (image upload)
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            title = formData.get("title");
            description = formData.get("description");
            subtitle = formData.get("subtitle");
            language_tag = formData.get("language_tag");
            category_tag = formData.get("category_tag");

            duration = Number(formData.get("duration"));
            price = Number(formData.get("price"));
            batch_start_date = formData.get("batch_start_date");
            enrollment_end_date = formData.get("enrollment_end_date");
            currency = formData.get("currency") || "INR";

            // 🔥 arrays (sent as JSON string from frontend)
            try {
                highlights = JSON.parse(formData.get("highlights") || "[]");
                languages = JSON.parse(formData.get("languages") || "[]");
            } catch {
                highlights = [];
                languages = [];
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

            ({
                title = null,
                description = null,
                course_image = null,
                subtitle = null,
                language_tag = null,
                category_tag = null,
                duration,
                price,
                batch_start_date,
                enrollment_end_date = null,
                currency = "INR",
                highlights =[],
                languages =[]
            } = body);
        }

        // 🔴 Required validations
        if (price == null || duration == null || !batch_start_date) {
            return json({
                error: "price, duration, batch_start_date are required"
            }, 400);
        }

        const course_id = crypto.randomUUID();
        const created_at = new Date().toISOString();

        // 🚀 TRANSACTION (important)
        const tx = env.cldb.transaction(async (txn) => {

            // 1️⃣ Insert course
            await txn.prepare(`
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
            ).run();

            // 2️⃣ Highlights
            if (Array.isArray(highlights) && highlights.length > 0) {
                const stmt = txn.prepare(`
                    INSERT INTO course_highlights (id, course_id, highlight)
                    VALUES (?, ?, ?)
                `);

                for (const h of highlights) {
                    await stmt.bind(
                        crypto.randomUUID(),
                        course_id,
                        h
                    ).run();
                }
            }

            // 3️⃣ Languages
            if (Array.isArray(languages) && languages.length > 0) {
                const stmt = txn.prepare(`
                    INSERT INTO course_languages (id, course_id, language)
                    VALUES (?, ?, ?)
                `);

                for (const l of languages) {
                    await stmt.bind(
                        crypto.randomUUID(),
                        course_id,
                        l
                    ).run();
                }
            }
        });

        await tx();

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

        let course_id,
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
            languages;

        const contentType = req.headers.get("Content-Type") || "";

        // 🔵 MULTIPART (image upload)
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

            // arrays
            try {
                highlights = JSON.parse(formData.get("highlights"));
            } catch {
                highlights = undefined;
            }

            try {
                languages = JSON.parse(formData.get("languages"));
            } catch {
                languages = undefined;
            }

            // 🔴 get existing course (needed for image update)
            const existing = await env.cldb.prepare(
                "SELECT * FROM courses WHERE course_id = ?"
            ).bind(course_id).first();

            if (!existing) {
                return json({ error: "Course not found" }, 404);
            }

            const file = formData.get("course_image");

            if (file instanceof File) {
                // 🔥 update existing image
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
            // 🟢 JSON
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

        // 🔴 Fetch existing (for partial updates)
        const existing = await env.cldb.prepare(
            "SELECT * FROM courses WHERE course_id = ?"
        ).bind(course_id).first();

        if (!existing) {
            return json({ error: "Course not found" }, 404);
        }

        const updated = {
            title: title ?? existing.title,
            description: description ?? existing.description,
            course_image: course_image ?? existing.course_image,
            subtitle: subtitle ?? existing.subtitle,
            language_tag: language_tag ?? existing.language_tag,
            category_tag: category_tag ?? existing.category_tag,
            duration: duration ?? existing.duration,
            price: price ?? existing.price,
            batch_start_date: batch_start_date ?? existing.batch_start_date,
            enrollment_end_date: enrollment_end_date ?? existing.enrollment_end_date,
            currency: currency ?? existing.currency
        };

        // 🚀 TRANSACTION
        const tx = env.cldb.transaction(async (txn) => {
            // 1️⃣ Dynamic Update (only changed fields)
            const fields = [];
            const values = [];

            if (title !== undefined) {
                fields.push("title = ?");
                values.push(title);
            }
            if (description !== undefined) {
                fields.push("description = ?");
                values.push(description);
            }
            if (course_image !== undefined) {
                fields.push("course_image = ?");
                values.push(course_image);
            }
            if (subtitle !== undefined) {
                fields.push("subtitle = ?");
                values.push(subtitle);
            }
            if (language_tag !== undefined) {
                fields.push("language_tag = ?");
                values.push(language_tag);
            }
            if (category_tag !== undefined) {
                fields.push("category_tag = ?");
                values.push(category_tag);
            }
            if (duration !== undefined) {
                fields.push("duration = ?");
                values.push(duration);
            }
            if (price !== undefined) {
                fields.push("price = ?");
                values.push(price);
            }
            if (batch_start_date !== undefined) {
                fields.push("batch_start_date = ?");
                values.push(batch_start_date);
            }
            if (enrollment_end_date !== undefined) {
                fields.push("enrollment_end_date = ?");
                values.push(enrollment_end_date);
            }
            if (currency !== undefined) {
                fields.push("currency = ?");
                values.push(currency);
            }

            // only run if something changed
            if (fields.length > 0) {
                const query = `
        UPDATE courses SET ${fields.join(", ")}
        WHERE course_id = ?
    `;

                await txn.prepare(query)
                    .bind(...values, course_id)
                    .run();
            }
            // 2️⃣ Highlights
            if (Array.isArray(highlights)) {
                await txn.prepare(
                    "DELETE FROM course_highlights WHERE course_id = ?"
                ).bind(course_id).run();

                if (highlights.length > 0) {
                    const stmt = txn.prepare(`
                        INSERT INTO course_highlights (id, course_id, highlight)
                        VALUES (?, ?, ?)
                    `);

                    for (const h of highlights) {
                        await stmt.bind(
                            crypto.randomUUID(),
                            course_id,
                            h
                        ).run();
                    }
                }
            }

            // 3️⃣ Languages
            if (Array.isArray(languages)) {
                await txn.prepare(
                    "DELETE FROM course_languages WHERE course_id = ?"
                ).bind(course_id).run();

                if (languages.length > 0) {
                    const stmt = txn.prepare(`
                        INSERT INTO course_languages (id, course_id, language)
                        VALUES (?, ?, ?)
                    `);

                    for (const l of languages) {
                        await stmt.bind(
                            crypto.randomUUID(),
                            course_id,
                            l
                        ).run();
                    }
                }
            }
        });

        await tx();

        return json({
            success: true,
            message: "Course updated successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}