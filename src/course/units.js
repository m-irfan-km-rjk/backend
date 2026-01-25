import json from "../util/json";
import { requireAuth } from "../users/auth";
import { uploadFileToStorage } from "../util/upload";

export async function unitsget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const result = await env.cldb.prepare(
        "SELECT * FROM units"
    ).all();
    return json({ units: result.results });
}
export async function unitspost(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    let title, unit_image, subject_id;
    const contentType = req.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        title = formData.get("title");
        subject_id = formData.get("subject_id");
        const file = formData.get("unit_image");
        if (file && file instanceof File) {
            unit_image = await uploadFileToStorage(file, "unit-images", env);
        } else {
            unit_image = file;
        }
    } else {
        const body = await req.json();
        title = body.title;
        subject_id = body.subject_id;
        unit_image = body.unit_image;
    }

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.cldb.prepare(
        "INSERT INTO units (unit_id, title, unit_image, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, title, unit_image, subject_id, created_at).run();
    return json({ success: true, message: "Unit created successfully" + title });
}
export async function unitsdelete(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { title } = await req.json();
    await env.cldb.prepare(
        "DELETE FROM units WHERE title = ?"
    ).bind(title).run();
    return json({ success: true, message: "Unit deleted successfully" });
}