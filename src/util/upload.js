import json from "./json";
import { requireAuth } from "../users/auth";

export async function uploadVideo(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
        return json({ error: "File is required" }, 400);
    }

    const key = `videos/${crypto.randomUUID()}-${file.name}`;
    await env.files.put(key, file);

    return json({ success: true, key: key, message: "Video uploaded successfully" });
}

export async function uploadImage(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
        return json({ error: "File is required" }, 400);
    }

    const key = `images/${crypto.randomUUID()}-${file.name}`;
    await env.files.put(key, file);

    return json({ success: true, key: key, message: "Image uploaded successfully" });
}

export async function uploadFileToStorage(file, folder, env) {
    const key = `${folder}/${crypto.randomUUID()}-${file.name}`;
    await env.files.put(key, file);
    return key;
}
