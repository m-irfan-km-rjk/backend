import json from "../util/json";
import { requireAuth } from "./auth";

import { uploadFileToStorage } from "../util/upload";

export async function profileget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const user_id = user.user_id;

    // 1️⃣ User
    const user_details = await env.cldb.prepare(
        "SELECT user_id, name, email, role, phone, last_login, created_at, image FROM users WHERE user_id = ?"
    ).bind(user_id).first();

    if (!user_details) {
        return json({ error: "User not found" }, 404);
    }

    // 2️⃣ Structure (batch → course → subjects → units)
    const structure = await env.cldb.prepare(`
        SELECT 
            b.batch_id,
            b.name AS batch_name,
            b.batch_image,
            b.course_id,

            c.title AS course_title,
            c.description,
            c.course_image,

            s.subject_id,
            s.title AS subject_title,
            s.subject_image,

            u.unit_id,
            u.title AS unit_title,
            u.unit_image

        FROM batch_students bs
        JOIN batch b ON bs.batch_id = b.batch_id
        JOIN courses c ON b.course_id = c.course_id
        LEFT JOIN subjects s ON s.course_id = c.course_id
        LEFT JOIN units u ON u.subject_id = s.subject_id

        WHERE bs.student_id = ?
        ORDER BY b.batch_id, s.subject_id, u.unit_id;
    `).bind(user_id).all();

    // 3️⃣ Videos
    const videos = await env.cldb.prepare(`
        SELECT video_id, unit_id, title, video_url FROM videos
    `).all();

    // 4️⃣ Notes
    const notes = await env.cldb.prepare(`
        SELECT note_id, unit_id, title, file_path FROM notes
    `).all();

    // Exams
    const exams = await env.cldb.prepare(`
        SELECT id, unit_id, subject_id, title, description, no_of_questions FROM exams
    `).all();

    // 5️⃣ Maps
    const videoMap = {};
    for (const v of videos.results) {
        if (!videoMap[v.unit_id]) videoMap[v.unit_id] = [];
        videoMap[v.unit_id].push({
            video_id: v.video_id,
            title: v.title,
            url: v.video_url
        });
    }

    const noteMap = {};
    for (const n of notes.results) {
        if (!noteMap[n.unit_id]) noteMap[n.unit_id] = [];
        noteMap[n.unit_id].push({
            note_id: n.note_id,
            title: n.title,
            file_path: n.file_path
        });
    }

    const examUnitMap = {};
    const examSubjectMap = {};
    for (const e of exams.results) {
        const examItem = {
            id: e.id,
            title: e.title,
            description: e.description,
            no_of_questions: e.no_of_questions
        };

        if (e.unit_id) {
            if (!examUnitMap[e.unit_id]) examUnitMap[e.unit_id] = [];
            examUnitMap[e.unit_id].push(examItem);
        }
        
        if (e.subject_id) {
            if (!examSubjectMap[e.subject_id]) examSubjectMap[e.subject_id] = [];
            examSubjectMap[e.subject_id].push(examItem);
        }
    }

    // 6️⃣ Build batches
    const batches = {};

    for (const row of structure.results) {

        // 🟣 BATCH
        if (!batches[row.batch_id]) {
            batches[row.batch_id] = {
                batch_id: row.batch_id,
                name: row.batch_name,
                batch_image: row.batch_image,
                course: {
                    course_id: row.course_id,
                    title: row.course_title,
                    description: row.description,
                    course_image: row.course_image,
                    subjects: {}
                }
            };
        }

        const batch = batches[row.batch_id];
        const course = batch.course;

        // 🟡 SUBJECT
        if (row.subject_id) {
            if (!course.subjects[row.subject_id]) {
                course.subjects[row.subject_id] = {
                    subject_id: row.subject_id,
                    title: row.subject_title,
                    subject_image: row.subject_image,
                    exams: examSubjectMap[row.subject_id] || [],
                    units: {}
                };
            }

            const subject = course.subjects[row.subject_id];

            // 🔵 UNIT
            if (row.unit_id) {
                if (!subject.units[row.unit_id]) {
                    subject.units[row.unit_id] = {
                        unit_id: row.unit_id,
                        title: row.unit_title,
                        unit_image: row.unit_image,
                        videos: videoMap[row.unit_id] || [],
                        notes: noteMap[row.unit_id] || [],
                        exams: examUnitMap[row.unit_id] || []
                    };
                }
            }
        }
    }

    return json({
        data: {
            user: user_details,
            batches
        },
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