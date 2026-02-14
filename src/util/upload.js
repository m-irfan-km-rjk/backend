import json from "./json";
import { requireAuth } from "../users/auth";

export async function getVideoUploadLink(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const maxDurationSeconds = url.searchParams.get("maxduration");

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
                maxDurationSeconds: maxDurationSeconds || 3600,
                metadata: {
                    user_id: user.user_id
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

export async function deleteFileFromStorage(key, env) {
    if (!key) throw new Error("Key is required");
    if (!env?.files) throw new Error("R2 binding 'files' not found");

    await env.files.delete(key);

    return true;
}

export async function uploadImage(file, env) {

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`
            },
            body: formData
        }
    );

    const result = await response.json();
    console.log(result);
    return result;

    //implement error handling
}

export async function deleteImage(imageId, env) {

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/images/v1/${imageId}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`
            }
        }
    );

    const result = await response.json();
    //console.log(result);
    return result;
}

export async function updateImage(newFile, oldImageId, env) {

    if (!newFile) {
        throw new Error("New file is required");
    }

    // 1️⃣ Upload new image
    const formData = new FormData();
    formData.append("file", newFile);
    formData.append("requireSignedURLs", "false"); // make public

    const uploadResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`
            },
            body: formData
        }
    );

    const uploadResult = await uploadResponse.json();

    if (!uploadResult.success) {
        throw new Error("Image upload failed");
    }

    const newImageId = uploadResult.result.id;
    const newImageUrl = uploadResult.result.variants[0];

    // 2️⃣ Delete old image (only if provided)
    if (oldImageId) {
        await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${oldImageId}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`
                }
            }
        );
    }

    // 3️⃣ Return new image data
    return {
        imageId: newImageId,
        imageUrl: newImageUrl
    };
}