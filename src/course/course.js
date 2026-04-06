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

        const body = await req.json();

        const {
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

            highlights = [],   // array
            languages = []     // array
        } = body;

        // 🔴 Required validations
        if (!price || !duration || !batch_start_date) {
            return json({
                error: "price, duration, batch_start_date are required"
            }, 400);
        }

        const course_id = crypto.randomUUID();
        const created_at = new Date().toISOString();

        // 1️⃣ Insert course
        await env.cldb.prepare(`
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

        // 2️⃣ Insert highlights (if any)
        if (Array.isArray(highlights) && highlights.length > 0) {
            const stmt = env.cldb.prepare(`
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

        // 3️⃣ Insert languages (if any)
        if (Array.isArray(languages) && languages.length > 0) {
            const stmt = env.cldb.prepare(`
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

        const body = await req.json();

        const {
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

            highlights,   // optional array
            languages     // optional array
        } = body;

        if (!course_id) {
            return json({ error: "course_id is required" }, 400);
        }

        // 🔴 Check if course exists
        const existing = await env.cldb.prepare(
            "SELECT * FROM courses WHERE course_id = ?"
        ).bind(course_id).first();

        if (!existing) {
            return json({ error: "Course not found" }, 404);
        }

        // 🧠 Use existing values if not provided
        const updatedCourse = {
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

        // 🚀 TRANSACTION (critical)
        const tx = env.cldb.transaction(async (txn) => {

            // 1️⃣ Update course
            await txn.prepare(`
                UPDATE courses SET
                    title = ?, description = ?, course_image = ?,
                    subtitle = ?, language_tag = ?, category_tag = ?,
                    duration = ?, price = ?,
                    batch_start_date = ?, enrollment_end_date = ?, currency = ?
                WHERE course_id = ?
            `).bind(
                updatedCourse.title,
                updatedCourse.description,
                updatedCourse.course_image,
                updatedCourse.subtitle,
                updatedCourse.language_tag,
                updatedCourse.category_tag,
                updatedCourse.duration,
                updatedCourse.price,
                updatedCourse.batch_start_date,
                updatedCourse.enrollment_end_date,
                updatedCourse.currency,
                course_id
            ).run();

            // 2️⃣ Update highlights (ONLY if provided)
            if (Array.isArray(highlights)) {

                // delete old
                await txn.prepare(
                    "DELETE FROM course_highlights WHERE course_id = ?"
                ).bind(course_id).run();

                // insert new
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

            // 3️⃣ Update languages (ONLY if provided)
            if (Array.isArray(languages)) {

                // delete old
                await txn.prepare(
                    "DELETE FROM course_languages WHERE course_id = ?"
                ).bind(course_id).run();

                // insert new
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

        await tx(); // execute transaction

        return json({
            success: true,
            message: "Course updated successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}