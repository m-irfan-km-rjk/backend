import json from "./json";

export async function videoget(req, env) {
    const key = "courses/subjects/units/videos/song.mp4";
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 // 1 hour
    );
    return json({ url: signedUrl });
}

export async function videoput(req, env) {
    const key = "courses/subjects/units/videos/song.mp4";
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 // 1 hour
    );
    return json({ url: signedUrl });
}


export async function streamWebhook(req, env) {

    if (req.method !== "POST") {
        return new Response("OK", { status: 200 });
    }

    const signature = req.headers.get("CF-Webhook-Signature");
    if (!signature) {
        return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.text();

    const isValid = await verifySignature(
        body,
        signature,
        env.STREAM_WEBHOOK_SECRET
    );

    if (!isValid) {
        console.warn("Invalid Stream webhook signature");
        return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        return new Response("OK", { status: 200 });
    }

    // Test webhook
    if (!payload.type) {
        console.log("Stream webhook test received");
        return new Response("OK", { status: 200 });
    }

    const { type, uid } = payload;
    if (!uid) return new Response("OK", { status: 200 });

    console.log("Stream webhook event:", type, uid);

    try {
        if (type === "video.uploaded") {
            await env.DB.prepare(`
                UPDATE videos SET status = ? WHERE id = ?
            `).bind("PROCESSING", uid).run();
        }

        if (type === "video.ready") {
            await env.DB.prepare(`
                UPDATE videos
                SET status = ?, duration = ?, thumbnail = ?
                WHERE id = ?
            `).bind(
                "READY",
                payload.duration ?? null,
                payload.thumbnail ?? null,
                uid
            ).run();
        }

        if (type === "video.failed") {
            await env.DB.prepare(`
                UPDATE videos SET status = ? WHERE id = ?
            `).bind("FAILED", uid).run();
        }

    } catch (err) {
        console.error("Webhook DB update failed:", err);
        // still return 200
    }

    return new Response("OK", { status: 200 });
}

async function verifySignature(body, signature, secret) {
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const mac = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(body)
    );

    const expected = Array.from(new Uint8Array(mac))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    return crypto.timingSafeEqual(
        encoder.encode(expected),
        encoder.encode(signature)
        
    );
}