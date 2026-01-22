import json from "./json";
import { requireAuth } from "./auth";

export async function uploadVideo(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { filename, fileType } = await req.json();
    if (!filename) return json({ error: "Filename is required" }, 400);

    const key = `videos/${crypto.randomUUID()}-${filename}`;
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 * 24 // 24 hours
    );

    return json({ url: signedUrl, key });
}

export async function uploadImage(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { filename } = await req.json();
    if (!filename) return json({ error: "Filename is required" }, 400);

    const key = `images/${crypto.randomUUID()}-${filename}`;
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 * 24 // 24 hours
    );

    return json({ url: signedUrl, key });
}
