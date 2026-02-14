import { requireAuth } from "../users/auth";
import json from "../util/json";
import {updateImage, uploadImage, deleteImage }from "../util/upload";

export async function coursesbatchpost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const id = crypto.randomUUID();
        let name, course_id, duration, batch_image;

        const contentType = req.headers.get("Content-Type") || "";

        //use uploadImage for cloudflare images

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            name = formData.get("name");
            course_id = formData.get("course_id");
            duration = formData.get("duration");

            const file = formData.get("batch_image");

            if (file instanceof File) {
                console.log(file);
                batch_image = await uploadImage(file, env);
                batch_image = batch_image.result.variants[0];
            }
        } else {
            name = req.name;
            course_id = req.course_id;
            duration = req.duration;
            batch_image = req.batch_image;
        }

        const created_at = new Date().toISOString();

        await env.cldb.prepare(
            "INSERT INTO batch (batch_id, name, batch_image, course_id, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, name, batch_image, course_id, duration, created_at).run();

        return json({ success: true, message: "Batch created successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchget(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const course_id = url.searchParams.get("course_id");

        let query = "SELECT batch_id, name, batch_image, duration, created_at FROM batch where course_id = ?";
        const params = [course_id];
        
        const stmt = env.cldb.prepare(query);
        const result =  await stmt.bind(...params).all();

        return json({ batch: result.results });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const batch_id = url.searchParams.get("batch_id");

        if (!batch_id) {
            return json({ error: "batch_id is required" }, 400);
        }
        const batchRow = await env.cldb
            .prepare(
                "SELECT batch_image FROM batch WHERE batch_id = ?"
            )
            .bind(batch_id)
            .first();
       
         await deleteImage(batchRow.batch_image, env);
          await env.cldb.prepare(
            "DELETE FROM batch WHERE batch_id = ?"
        ).bind(batch_id).run();

        return json({ success: true, message: "Batch deleted successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const batch_id = url.searchParams.get("batch_id");

        if (!batch_id) {
            return json({ error: "batch_id is required" }, 400);
        }

        const formData = await req.formData();
        const name = formData.get("name");
        const duration = formData.get("duration");
        const file = formData.get("batch_image");
        let batch_image;
        const batchRow = await env.cldb
                .prepare(
                    "SELECT batch_image FROM batch WHERE batch_id = ?"
                )
                .bind(batch_id)
                .first();
                   if (!batchRow) {
                                return json({ error: "Batch not found" }, 404);
                            }
        if (file instanceof File) {
            const updated = await updateImage(file, batchRow.batch_image.split("/")[batchRow.batch_image.split("/").length - 2], env);
            batch_image = updated.imageUrl;
        }else {
            batch_image = batchRow.batch_image;
        }

        const updated_at = new Date().toISOString();

        await env.cldb.prepare(
            "UPDATE batch SET name = ?, batch_image = ?, duration = ?, updated_at = ? WHERE batch_id = ?"
        ).bind(name, batch_image, duration, updated_at, batch_id).run();

        return json({ success: true, message: "Batch updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}
