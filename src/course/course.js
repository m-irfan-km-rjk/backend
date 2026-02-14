import json from "../util/json";
import { requireAuth } from "../users/auth";
import { updateImage, uploadImage, deleteImage } from "../util/upload";

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

    //use uploadImage for cloudflare images

    if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();

        title = formData.get("title");
        description = formData.get("description");

        const file = formData.get("course_image");

        if (file instanceof File) {
            console.log(file);
            course_image = await uploadImage(file, env);
            course_image = course_image.result.variants[0];
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
        const courseRow = await env.cldb
            .prepare(
                "SELECT course_image FROM courses WHERE course_id = ?"
            )
            .bind(id)
            .first();

        if (!courseRow) {
            return json({ error: "Course not found" }, 404);
        }

        await deleteImage(courseRow.course_image, env);

        //error handling

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
            const courseRow = await env.cldb
                .prepare(
                    "SELECT course_image FROM courses WHERE course_id = ?"
                )
                .bind(course_id)
                .first();

            if (!courseRow) {
                return json({ error: "Course not found" }, 404);
            }

            if (file instanceof File) {
                const updated = await updateImage(file, courseRow.course_image.split("/")[courseRow.course_image.split("/").length - 2], env);
                course_image = updated.imageUrl;
            } else {
                course_image = courseRow.course_image;
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

        await env.cldb.prepare(
            "UPDATE courses SET title = ?, description = ?, course_image = ? WHERE course_id = ?"
        ).bind(title, description, course_image, course_id).run();

        return json({ success: true, message: "Course updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}