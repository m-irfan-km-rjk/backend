import { requireAuth } from "../users/auth";
import json from "../util/json";

export async function quizcreate(req, env) {
    try {
        const body = await req.json();
        const { unit_id, title, questions } = body;

        if (!unit_id || !title || !questions || !Array.isArray(questions)) {
            return new Response("Invalid input", { status: 400 });
        }

        const exam_id = crypto.randomUUID();

        await env.cldb.prepare(`
            INSERT INTO exam (id, unit_id, no_of_questions, title)
            VALUES (?, ?, ?, ?)
        `).bind(
            exam_id,
            unit_id,
            questions.length,
            title
        ).run();

        for (const q of questions) {
            const question_id = crypto.randomUUID();

            if (!q.question || !q.type) {
                continue; // skip invalid
            }

            await env.cldb.prepare(`
                INSERT INTO questions (
                    question_id,
                    exam_id,
                    question,
                    option_a,
                    option_b,
                    option_c,
                    option_d,
                    correct_option,
                    type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                question_id,
                exam_id,
                q.question,
                q.type === "mcq" ? q.option_a || null : null,
                q.type === "mcq" ? q.option_b || null : null,
                q.type === "mcq" ? q.option_c || null : null,
                q.type === "mcq" ? q.option_d || null : null,
                q.type === "mcq" ? q.correct_option || null : null,
                q.type
            ).run();
        }

        return new Response(JSON.stringify({
            success: true,
            exam_id
        }), { status: 201 });

    } catch (err) {
        return new Response(JSON.stringify({
            error: err.message
        }), { status: 500 });
    }
}

export async function quizimageupload(req, env) {

}