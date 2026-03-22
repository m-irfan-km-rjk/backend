import json from "../util/json";
import { requireAuth } from "./auth";

import { uploadFileToStorage } from "../util/upload";

export async function profileget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const user_id = user.user_id;

    // 1️⃣ Get user details (only needed fields)
    const user_details = await env.cldb.prepare(
        "SELECT user_id, name, email FROM users WHERE user_id = ?"
    ).bind(user_id).first();

    if (!user_details) {
        return json({ error: "User not found" }, 404);
    }

    // 2️⃣ Get structure (courses → subjects → units)
    const structure = await env.cldb.prepare(`
        SELECT 
            c.course_id,
            c.title AS course_title,
            c.description,
            c.course_image,

            s.subject_id,
            s.title AS subject_title,
            s.subject_image,

            u.unit_id,
            u.title AS unit_title,
            u.unit_image

        FROM courses c
        JOIN user_courses uc ON uc.course_id = c.course_id
        LEFT JOIN subjects s ON s.course_id = c.course_id
        LEFT JOIN units u ON u.subject_id = s.subject_id

        WHERE uc.user_id = ?
        ORDER BY c.course_id, s.subject_id, u.unit_id;
    `).bind(user_id).all();

    // 3️⃣ Get videos (separate query)
    const videos = await env.cldb.prepare(`
        SELECT video_id, unit_id, title, video_url
        FROM videos
    `).all();

    // 4️⃣ Get notes (separate query)
    const notes = await env.cldb.prepare(`
        SELECT note_id, unit_id, title, file_path
        FROM notes
    `).all();

    // 5️⃣ Map videos by unit_id
    const videoMap = {};
    for (const v of videos.results) {
        if (!videoMap[v.unit_id]) videoMap[v.unit_id] = [];
        videoMap[v.unit_id].push({
            video_id: v.video_id,
            title: v.title,
            url: v.video_url
        });
    }

    // 6️⃣ Map notes by unit_id
    const noteMap = {};
    for (const n of notes.results) {
        if (!noteMap[n.unit_id]) noteMap[n.unit_id] = [];
        noteMap[n.unit_id].push({
            note_id: n.note_id,
            title: n.title,
            file_path: n.file_path
        });
    }

    // 7️⃣ Build nested structure
    const courses = {};

    for (const row of structure.results) {
        // COURSE
        if (!courses[row.course_id]) {
            courses[row.course_id] = {
                course_id: row.course_id,
                title: row.course_title,
                description: row.description,
                course_image: row.course_image,
                subjects: {}
            };
        }

        const course = courses[row.course_id];

        // SUBJECT
        if (row.subject_id) {
            if (!course.subjects[row.subject_id]) {
                course.subjects[row.subject_id] = {
                    subject_id: row.subject_id,
                    title: row.subject_title,
                    subject_image: row.subject_image,
                    units: {}
                };
            }

            const subject = course.subjects[row.subject_id];

            // UNIT
            if (row.unit_id) {
                if (!subject.units[row.unit_id]) {
                    subject.units[row.unit_id] = {
                        unit_id: row.unit_id,
                        title: row.unit_title,
                        unit_image: row.unit_image,
                        videos: videoMap[row.unit_id] || [],
                        notes: noteMap[row.unit_id] || []
                    };
                }
            }
        }
    }

    // 8️⃣ Final response
    const details = {
        user: user_details,
        courses
    };

    return json({
        data: details,
        success: true,
        message: "Profile fetched successfully"
    });
}

export async function profileput(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const { name, role, email, phone } = body;
    await env.cldb.prepare(
        "UPDATE users SET name = ?, role = ?, email = ?, phone = ? WHERE user_id = ?"
    ).bind(name, role, email, phone, user.user_id).run();
    return json({ success: true, message: "Profile updated successfully" });
}

export async function profileimageput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const formData = await req.formData();
        const file = formData.get("image");

        if (!file || !(file instanceof File)) {
            return json({ error: "Image file is required" }, 400);
        }

        const image = await uploadFileToStorage(
            file,
            `users/${user.user_id}`,
            "profile",
            env
        );

        await env.cldb.prepare(
            "UPDATE users SET image = ? WHERE user_id = ?"
        ).bind(image, user.user_id).run();

        return json({ success: true, message: "Profile image updated successfully", image });
    } catch (e) {
        return json({ error: e.message || e }, 500);
    }
}