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
        const { id } = await req.json();
        await env.cldb.prepare(
            "DELETE FROM courses WHERE course_id  = ?"
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

        let course_id, title, description, course_image;
        const contentType = req.headers.get("Content-Type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            course_id = formData.get("course_id");
            title = formData.get("title");
            description = formData.get("description");
            const file = formData.get("course_image");

            if (file instanceof File) {
                course_image = await uploadFileToStorage(
                    file,
                    `courses/${course_id}`,
                    "thumbnail",
                    env
                );
            } else {
                course_image = file;
            }
        } else {
            const body = await req.json();
            course_id = body.course_id;
            title = body.title;
            description = body.description;
            course_image = body.course_image;
        }

        if (!course_id) {
            return json({ error: "course_id is required" }, 400);
        }

        // If specific fields are undefined (not provided), we might want to avoid overwriting them with null.
        // However, standard SQL update replaces. To allow partial updates, we'd need to construct the query dynamicallly.
        // Assuming the client sends the current value if not changing it, or we fetch & merge.
        // For now, I'll proceed with the provided values, but handle the case where we might overwrite with null if not careful.
        // Actually, if it's form-data, getting a missing field returns null.
        // Let's do a quick check to keep existing values if params are missing?
        // The original code was: "UPDATE courses SET title = ?, description = ?, course_image = ? WHERE course_id = ?"
        // implying it expects all values. I will stick to that logic but ensure we pass the variables we extracted.

        await env.cldb.prepare(
            "UPDATE courses SET title = ?, description = ?, course_image = ? WHERE course_id = ?"
        ).bind(title, description, course_image, course_id).run();

        return json({ success: true, message: "Course updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}