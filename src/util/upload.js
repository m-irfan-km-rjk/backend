import json from "./json";
import { requireAuth } from "../users/auth";

export async function getVideoUploadLink(req, env) {

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.CF_STREAM_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                maxDurationSeconds: 3600,
                metadata: {
                    user_id: "user_id"
                }
            }),
        }
    );

    const data = await res.json();

    if (!data.success) {
        return json({ error: "Failed to create upload link", data: data }, 500);
    }

    return json({
        success: true,
        upload_url: data.result.uploadURL,
        video_id: data.result.uid
    });
}

export async function uploadVideo(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const formData = await req.formData();
    const video = formData.get("video");

    if (!video || !(video instanceof File)) {
        return json({ error: "Video is required" }, 400);
    }

    const key = `videos/${crypto.randomUUID()}-${video.name}`;
    await env.files.put(key, video);

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

export async function uploadFileToStorage(file, folder, name, env) {
    if (!file) throw new Error("File is required");
    if (!env?.files) throw new Error("R2 binding 'files' not found");

    const filename = name || `${crypto.randomUUID()}-${file.name}`;
    const key = `${folder}/${filename}.${file.name.split(".").pop()}`;

    await env.files.put(
        key,
        file.stream(),
        {
            httpMetadata: {
                contentType: file.type || "application/octet-stream"
            }
        }
    );

    return key;
}
