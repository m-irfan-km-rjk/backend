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

        const batchStmts = [];

        batchStmts.push(
            env.cldb.prepare(`
                INSERT INTO exams (id, unit_id, subject_id, title, description, no_of_questions)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                exam_id,
                unit_id || null,
                subject_id || null,
                title,
                description || null,
                questions.length
            )
        );

        for (const q of questions) {
            const question_id = crypto.randomUUID();

            batchStmts.push(
                env.cldb.prepare(`
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
                )
            );

            if (q.type === "multipleChoice" && Array.isArray(q.options)) {
                for (let i = 0; i < q.options.length; i++) {
                    const option_id = crypto.randomUUID();
                    const isCorrect = q.correctOptionIndexes?.includes(i) ? 1 : 0;

                    batchStmts.push(
                        env.cldb.prepare(`
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
                        )
                    );
                }
            }
        }

        if (batchStmts.length > 0) {
            await env.cldb.batch(batchStmts);
        }

        return json({ success: true, exam_id }, 201);

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function quizget(req, env) {
    try {
        const url = new URL(req.url);
        const exam_id = url.searchParams.get("exam_id");

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
                question_id: q.id,
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
        const url = new URL(req.url);

        const unit_id = url.searchParams.get("unit_id");
        const subject_id = url.searchParams.get("subject_id");

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

        const batchStmts = [];

        // ✅ Update exam details
        batchStmts.push(
            env.cldb.prepare(`
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
            )
        );

        // ✅ Delete old questions (cascade deletes options)
        batchStmts.push(
            env.cldb.prepare(`
                DELETE FROM questions WHERE exam_id = ?
            `).bind(exam_id)
        );

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

            batchStmts.push(
                env.cldb.prepare(`
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
                )
            );

            // ✅ Insert options (MCQ only)
            if (q.type === "multipleChoice" && Array.isArray(q.options)) {
                for (let i = 0; i < q.options.length; i++) {
                    const option_id = crypto.randomUUID();
                    const isCorrect = q.correctOptionIndexes?.includes(i) ? 1 : 0;

                    batchStmts.push(
                        env.cldb.prepare(`
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
                        )
                    );
                }
            }
        }

        if (batchStmts.length > 0) {
            await env.cldb.batch(batchStmts);
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

export async function submitExam(req, env) {
    try {
        const body = await req.json();

        const { exam_id, student_id, question_responses } = body;

        if (!exam_id || !student_id || !Array.isArray(question_responses)) {
            return new Response("Invalid input", { status: 400 });
        }

        // 🔥 FIX 2 — Prevent duplicate submissions
        const existing = await env.cldb.prepare(`
            SELECT id FROM exam_responses 
            WHERE exam_id = ? AND student_id = ?
        `).bind(exam_id, student_id).first();

        if (existing) {
            return new Response("Already submitted", { status: 400 });
        }

        const response_id = crypto.randomUUID();
        const submitted_at = new Date().toISOString();

        let totalMarks = 0;
        let obtainedMarks = 0;

        // ✅ Get all questions for exam
        const questionsRes = await env.cldb.prepare(`
            SELECT * FROM questions WHERE exam_id = ?
        `).bind(exam_id).all();

        const questionsMap = {};
        for (const q of questionsRes.results) {
            questionsMap[q.id] = q;
            totalMarks += q.marks || 1;
        }

        // 🔥 FIX 3 — Enforce required questions
        for (const q of questionsRes.results) {
            if (q.is_required) {
                const answered = question_responses.find(
                    qr => qr.question_id === q.id
                );

                if (!answered) {
                    return new Response("Required question missing", { status: 400 });
                }
            }
        }

        // 🔥 FIX 1 — Batch fetch all options (avoid N+1 queries)
        const allOptionsRes = await env.cldb.prepare(`
            SELECT * FROM options 
            WHERE question_id IN (
                SELECT id FROM questions WHERE exam_id = ?
            )
            ORDER BY rowid ASC
        `).bind(exam_id).all();

        const optionsMap = {};
        for (const o of allOptionsRes.results) {
            if (!optionsMap[o.question_id]) {
                optionsMap[o.question_id] = [];
            }
            optionsMap[o.question_id].push(o);
        }

        const batchStmts = [];

        // ✅ Process each question response and compute final obtainedMarks
        for (const qr of question_responses) {
            const q = questionsMap[qr.question_id];
            if (!q) continue;

            let marksAwarded = 0;

            if (q.type === "multipleChoice") {
                // 🔥 FIX 1 — Use pre-fetched options map (no per-question DB query)
                const options = optionsMap[q.id] || [];

                const correctIndexes = options
                    .map((o, index) => o.is_correct ? index : -1)
                    .filter(i => i !== -1);

                const studentIndexes = qr.selected_option_indexes || [];

                // Compare arrays
                const isCorrect =
                    correctIndexes.length === studentIndexes.length &&
                    correctIndexes.every(i => studentIndexes.includes(i));

                if (isCorrect) {
                    marksAwarded = q.marks || 1;
                }

                obtainedMarks += marksAwarded;
            } else {
                // ✍️ Subjective → marks_awarded = null (teacher grades later)
                marksAwarded = null;
            }

            batchStmts.push(
                env.cldb.prepare(`
                    INSERT INTO question_responses (
                        id,
                        exam_response_id,
                        question_id,
                        type,
                        selected_option_indexes,
                        written_answer,
                        marks_awarded,
                        feedback
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    crypto.randomUUID(),
                    response_id,
                    qr.question_id,
                    q.type,
                    JSON.stringify(qr.selected_option_indexes || []),
                    qr.written_answer || null,
                    marksAwarded,
                    null
                )
            );
        }

        // ✅ Prepare the primary exam response insertion using fully computed marks
        const examResponseInsertStmt = env.cldb.prepare(`
            INSERT INTO exam_responses (
                id, exam_id, student_id, submitted_at, total_marks, obtained_marks
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            response_id,
            exam_id,
            student_id,
            submitted_at,
            totalMarks,
            obtainedMarks
        );

        // Batch Insert All: Execute transaction (Exam -> Question Responses)
        await env.cldb.batch([examResponseInsertStmt, ...batchStmts]);

        return json({
            success: true,
            response_id,
            total_marks: totalMarks,
            obtained_marks: obtainedMarks,
            percentage: totalMarks === 0 ? 0 : (obtainedMarks / totalMarks) * 100
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function getExamResult(req, env) {
    try {
        const { response_id } = await req.json();

        if (!response_id) {
            return new Response("response_id required", { status: 400 });
        }

        // ✅ Get exam response
        const exam = await env.cldb.prepare(`
            SELECT * FROM exam_responses WHERE id = ?
        `).bind(response_id).first();

        if (!exam) {
            return new Response("Response not found", { status: 404 });
        }

        // ✅ Get question responses
        const qrRes = await env.cldb.prepare(`
            SELECT * FROM question_responses
            WHERE exam_response_id = ?
        `).bind(response_id).all();

        const questionResponses = qrRes.results.map(qr => ({
            question_id: qr.question_id,
            type: qr.type,
            selected_option_indexes: JSON.parse(qr.selected_option_indexes || "[]"),
            written_answer: qr.written_answer,
            marks_awarded: qr.marks_awarded,
            feedback: qr.feedback
        }));

        return json({
            response_id: exam.id,
            exam_id: exam.exam_id,
            student_id: exam.student_id,
            submitted_at: exam.submitted_at,
            total_marks: exam.total_marks,
            obtained_marks: exam.obtained_marks,
            percentage:
                exam.total_marks === 0
                    ? 0
                    : (exam.obtained_marks / exam.total_marks) * 100,
            question_responses: questionResponses
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

export async function gradeExam(req, env) {
    try {
        const { response_id, updates } = await req.json();

        /*
        updates = [
          {
            question_id: "q1",
            marks_awarded: 4,
            feedback: "Good answer"
          }
        ]
        */

        if (!response_id || !Array.isArray(updates)) {
            return new Response("Invalid input", { status: 400 });
        }

        let totalObtained = 0;

        // ✅ Update each question response (Batched)
        const batchStmts = [];
        for (const u of updates) {
            batchStmts.push(
                env.cldb.prepare(`
                    UPDATE question_responses
                    SET marks_awarded = ?, feedback = ?
                    WHERE exam_response_id = ? AND question_id = ?
                `).bind(
                    u.marks_awarded,
                    u.feedback || null,
                    response_id,
                    u.question_id
                )
            );
        }

        if (batchStmts.length > 0) {
            await env.cldb.batch(batchStmts);
        }

        // ✅ Recalculate total obtained marks
        const sumRes = await env.cldb.prepare(`
            SELECT SUM(marks_awarded) as total
            FROM question_responses
            WHERE exam_response_id = ?
        `).bind(response_id).first();

        totalObtained = sumRes.total || 0;

        // ✅ Update exam_responses
        await env.cldb.prepare(`
            UPDATE exam_responses
            SET obtained_marks = ?
            WHERE id = ?
        `).bind(totalObtained, response_id).run();

        return json({
            success: true,
            obtained_marks: totalObtained
        });

    } catch (err) {
        return json({ error: err.message }, 500);
    }
}