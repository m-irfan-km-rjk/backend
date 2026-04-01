import { requireAuth } from "../users/auth";
import json from "../util/json";

export async function quizcreate(req, env) {
    try {
        const body = await req.json();
        const { unit_id, subject_id, title, description, questions } = body;

        // ✅ Either one required
        if ((!unit_id && !subject_id) || !title || !questions || !Array.isArray(questions)) {
            return new Response("Either unit_id or subject_id is required", { status: 400 });
        }

        const exam_id = crypto.randomUUID();

        await env.cldb.prepare(`
            INSERT INTO exams (id, unit_id, subject_id, title, description, no_of_questions)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            exam_id,
            unit_id || null,
            subject_id || null,
            title,
            description || null,
            questions.length
        ).run();

        for (const q of questions) {
            const question_id = crypto.randomUUID();

            await env.cldb.prepare(`
                INSERT INTO questions (
                    id,
                    exam_id,
                    type,
                    title,
                    description,
                    image_path,
                    answer,
                    marks,
                    is_required
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                question_id,
                exam_id,
                q.type,
                q.title || "",
                q.description || "",
                q.imagePath
                    ? q.imagePath.replace("https://media.crescentlearning.org/", "")
                    : null,
                q.answer || null,
                q.marks ?? 1,
                q.isRequired ? 1 : 0
            ).run();

            if (q.type === "multipleChoice" && Array.isArray(q.options)) {
                for (let i = 0; i < q.options.length; i++) {
                    const option_id = crypto.randomUUID();

                    const isCorrect =
                        q.correctOptionIndexes?.includes(i) ? 1 : 0;

                    await env.cldb.prepare(`
                        INSERT INTO options (
                            id,
                            question_id,
                            option_text,
                            is_correct
                        ) VALUES (?, ?, ?, ?)
                    `).bind(
                        option_id,
                        question_id,
                        q.options[i],
                        isCorrect
                    ).run();
                }
            }
        }

        return json({ success: true, exam_id }, 201);

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function quizget(req, env) {
    try {
        const { exam_id } = await req.json();

        if (!exam_id) {
            return new Response("exam_id required", { status: 400 });
        }

        // ✅ 1. Get exam
        const exam = await env.cldb.prepare(`
            SELECT * FROM exams WHERE id = ?
        `).bind(exam_id).first();

        if (!exam) {
            return new Response("Exam not found", { status: 404 });
        }

        // ✅ 2. Get questions
        const questionsRes = await env.cldb.prepare(`
            SELECT * FROM questions WHERE exam_id = ?
        `).bind(exam_id).all();

        const questions = [];

        for (const q of questionsRes.results) {
            let options = [];
            let correctOptionIndexes = [];

            // ✅ 3. If MCQ → fetch options
            if (q.type === "multipleChoice") {
                const optionsRes = await env.cldb.prepare(`
                    SELECT * FROM options WHERE question_id = ?
                `).bind(q.id).all();

                options = optionsRes.results.map(o => o.option_text);

                correctOptionIndexes = optionsRes.results
                    .map((o, index) => o.is_correct ? index : -1)
                    .filter(i => i !== -1);
            }

            const BASE_URL = "https://media.crescentlearning.org";

            questions.push({
                type: q.type,
                title: q.title || "",
                description: q.description || "",
                imagePath: q.image_path
                    ? `${BASE_URL}/${q.image_path}`
                    : null,
                answer: q.answer || "",
                marks: q.marks,
                isRequired: q.is_required === 1,
                options,
                correctOptionIndexes
            });
        }

        // ✅ 4. Final response
        return json({
            id: exam.id,
            title: exam.title,
            description: exam.description,
            unit_id: exam.unit_id,
            subject_id: exam.subject_id,
            questions
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function quizgetall(req, env) {
    try {
        const { unit_id, subject_id } = await req.json();

        // ✅ Validation
        if (!unit_id && !subject_id) {
            return new Response("unit_id or subject_id required", { status: 400 });
        }

        let query = "";
        let bindValue = "";

        // ✅ Decide filter
        if (unit_id) {
            query = `SELECT * FROM exams WHERE unit_id = ?`;
            bindValue = unit_id;
        } else {
            query = `SELECT * FROM exams WHERE subject_id = ?`;
            bindValue = subject_id;
        }

        const res = await env.cldb.prepare(query)
            .bind(bindValue)
            .all();

        const exams = res.results.map(e => ({
            id: e.id,
            title: e.title,
            description: e.description,
            unit_id: e.unit_id,
            subject_id: e.subject_id,
            no_of_questions: e.no_of_questions
        }));

        return json({ exams });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function quizdelete(req, env) {
    try {
        const { exam_id } = await req.json();

        if (!exam_id) {
            return new Response("exam_id required", { status: 400 });
        }

        // Optional: check if exists
        const exam = await env.cldb.prepare(`
            SELECT id FROM exams WHERE id = ?
        `).bind(exam_id).first();

        if (!exam) {
            return new Response("Exam not found", { status: 404 });
        }

        // ✅ Delete exam (cascade will handle rest)
        await env.cldb.prepare(`
            DELETE FROM exams WHERE id = ?
        `).bind(exam_id).run();

        const objects = await env.files.list({
            prefix: `quiz/${exam_id}/images/`
        });

        for (const obj of objects.objects) {
            await env.files.delete(obj.key);
        }

        return json({
            success: true,
            message: "Exam deleted successfully"
        });

    } catch (err) {
        return json({
            error: err.message
        }, 500);
    }
}

export async function quizupdate(req, env) {
    try {
        const body = await req.json();

        const {
            exam_id,
            unit_id,
            subject_id,
            title,
            description,
            questions
        } = body;

        if (!exam_id || (!unit_id && !subject_id) || !title || !questions) {
            return new Response("Invalid input", { status: 400 });
        }

        // ✅ Check if exam exists
        const existing = await env.cldb.prepare(`
            SELECT id FROM exams WHERE id = ?
        `).bind(exam_id).first();

        if (!existing) {
            return new Response("Exam not found", { status: 404 });
        }

        // ✅ Update exam details
        await env.cldb.prepare(`
            UPDATE exams
            SET title = ?, description = ?, unit_id = ?, subject_id = ?, no_of_questions = ?
            WHERE id = ?
        `).bind(
            title,
            description || null,
            unit_id || null,
            subject_id || null,
            questions.length,
            exam_id
        ).run();

        // ✅ Delete old questions (cascade deletes options)
        await env.cldb.prepare(`
            DELETE FROM questions WHERE exam_id = ?
        `).bind(exam_id).run();

        // ✅ Insert new questions
        for (const q of questions) {
            const question_id = crypto.randomUUID();

            if (q.imagePath) {
                const key = q.imagePath.replace(
                    "https://media.crescentlearning.org/",
                    ""
                );

                const exists = await env.files.head(key);
                if (!exists) {
                    return new Response("Invalid imagePath", { status: 400 });
                }
            }

            await env.cldb.prepare(`
                INSERT INTO questions (
                    id,
                    exam_id,
                    type,
                    title,
                    description,
                    image_path,
                    answer,
                    marks,
                    is_required
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                question_id,
                exam_id,
                q.type,
                q.title || "",
                q.description || "",
                q.imagePath
                    ? q.imagePath.replace("https://media.crescentlearning.org/", "")
                    : null,
                q.answer || null,
                q.marks ?? 1,
                q.isRequired ? 1 : 0
            ).run();

            // ✅ Insert options (MCQ only)
            if (q.type === "multipleChoice" && Array.isArray(q.options)) {
                for (let i = 0; i < q.options.length; i++) {
                    const option_id = crypto.randomUUID();

                    const isCorrect =
                        q.correctOptionIndexes?.includes(i) ? 1 : 0;

                    await env.cldb.prepare(`
                        INSERT INTO options (
                            id,
                            question_id,
                            option_text,
                            is_correct
                        ) VALUES (?, ?, ?, ?)
                    `).bind(
                        option_id,
                        question_id,
                        q.options[i],
                        isCorrect
                    ).run();
                }
            }
        }

        return json({
            success: true,
            message: "Exam updated successfully"
        });

    } catch (err) {
        return json({
            error: err.message
        }, 500);
    }
}

export async function quizimageupload(req, env) {
    try {
        const formData = await req.formData();

        const file = formData.get("file");
        const exam_id = formData.get("exam_id");

        if (!file || !exam_id) {
            return new Response("file and exam_id required", { status: 400 });
        }

        // Generate unique filename
        const ext = file.name.split(".").pop();
        const image_id = crypto.randomUUID();

        const key = `quiz/${exam_id}/images/${image_id}.${ext}`;

        // Upload to R2
        await env.files.put(key, file.stream(), {
            httpMetadata: {
                contentType: file.type
            }
        });

        return json({
            success: true,
            key, // store this in DB (imagePath)
            url: `https://media.crescentlearning.org/${key}` // optional if public
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function quizimagedelete(req, env) {
    try {
        const { key } = await req.json();

        if (!key) {
            return new Response("key required", { status: 400 });
        }

        await env.files.delete(key);

        return json({
            success: true,
            message: "Image deleted"
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}