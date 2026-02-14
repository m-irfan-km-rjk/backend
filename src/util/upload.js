import json from "./json";
import { requireAuth } from "../users/auth";

export async function getVideoUploadLink(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { title, description, unit_id } = await req.json();

    const uploadLength = req.headers.get("Upload-Length");
    const uploadMetadata = req.headers.get("Upload-Metadata");

    if (!uploadLength) {
        return json({ error: "Upload-Length header required" }, 400);
    }

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?direct_user=true`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.CF_STREAM_API_TOKEN}`,
                "Tus-Resumable": "1.0.0",
                "Upload-Length": uploadLength,
                "Upload-Metadata": uploadMetadata || "",
            },
        }
    );

    if (res.status !== 201 && res.status !== 200) {
        const errorText = await res.text();
        console.error("Stream direct_user error:", errorText);
        return json({ error: "Failed to create TUS upload session" }, 500);
    }

    const uploadUrl = res.headers.get("Location");

    if (!uploadUrl) {
        return json({ error: "No upload URL returned" }, 500);
    }

    const uid = uploadUrl.split("/").pop().split("?")[0];

    await env.cldb.prepare("INSERT INTO videos (video_id, title, description, unit_id) VALUES (?, ?, ?, ?)").bind(uid, title, description, unit_id).run();

    return json({
        success: true,
        upload_url: uploadUrl,
        video_id: uid
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

export async function onRequest(req, env) {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?direct_user=true`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Length": req.headers.get("Upload-Length"),
            "Upload-Metadata": req.headers.get("Upload-Metadata"),
        },
    });

    const destination = response.headers.get("Location");

    return new Response(null, {
        headers: {
            "Access-Control-Expose-Headers": "Location",
            "Access-Control-Allow-Headers": "",
            "Access-Control-Allow-Origin": "",
            Location: destination,
        },
    });
}