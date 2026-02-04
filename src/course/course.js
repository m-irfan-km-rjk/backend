import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage } from "../util/upload";

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
    const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return json({ courses: result.results });
}
export async function coursespost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const id = crypto.randomUUID();
    let title, description, course_image;

    const contentType = req.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();

        title = formData.get("title");
        description = formData.get("description");

        const file = formData.get("course_image");

        if (file instanceof File) {
            course_image = await uploadFileToStorage(
                file,
                `courses/${id}`,
                "thumbnail",
                env
            );
        }
    } else {
        const body = await req.json();
        title = body.title;
        description = body.description;
        course_image = body.course_image;
    }

    const created_at = new Date().toISOString();

    await env.cldb.prepare(
        "INSERT INTO courses (course_id, title, description, course_image, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, title, description, course_image, created_at).run();

    return json({ success: true });
}

export async function coursesdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);
        const { title } = await req.json();
        await env.cldb.prepare(
            "DELETE FROM courses WHERE title = ?"
        ).bind(title).run();
        return json({ success: true, message: "Course deleted successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

