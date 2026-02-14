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

    const signature = req.headers.get("Webhook-Signature");
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
        console.log(body, signature);
        return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        return new Response("OK", { status: 200 });
    }

    const uid = payload.uid;
    if (!uid) return new Response("OK", { status: 200 });

    console.log("Stream webhook state:", payload.status?.state, uid);

    try {
        // VIDEO READY
        if (
            payload.status?.state === "ready" &&
            payload.readyToStream === true
        ) {
            await env.cldb.prepare(`
        UPDATE videos
        SET status = ?, duration = ?, thumbnail_url = ?, video_url = ?
        WHERE video_id = ?
      `).bind(
                "READY",
                payload.duration ?? null,
                payload.thumbnail ?? null,
                payload.playback.hls ?? null,
                uid
            ).run();
        }

        // VIDEO FAILED
        if (payload.status?.state === "error") {
            await env.cldb.prepare(`
        UPDATE videos
        SET status = ?
        WHERE video_id = ?
      `).bind(
                "FAILED",
                uid
            ).run();
        }

    } catch (err) {
        console.error("Webhook DB update failed:", err);
    }

    return new Response("OK", { status: 200 });
}

async function verifySignature(body, header, secret) {
    console.log("---- STREAM WEBHOOK DEBUG START ----");

    if (!header) {
        console.log("❌ No Webhook-Signature header");
        return false;
    }

    if (!secret) {
        console.log("❌ No secret configured");
        return false;
    }

    const parts = header.split(",");
    const timePart = parts.find(p => p.startsWith("time="));
    const sigPart = parts.find(p => p.startsWith("sig1="));

    if (!timePart || !sigPart) {
        console.log("❌ Header missing time or sig1");
        return false;
    }

    const time = timePart.split("=")[1];
    const signature = sigPart.split("=")[1];

    console.log("Parsed time:", time);
    console.log("Signature from header:", signature);

    const signedPayload = `${time}.${body}`;

    console.log("Signed payload length:", signedPayload.length);
    console.log("Signed payload (first 100 chars):", signedPayload.slice(0, 100));

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    console.log("Computed signature:", expectedSignature);
    console.log("Matches:", expectedSignature === signature);
    console.log("---- STREAM WEBHOOK DEBUG END ----");

    return expectedSignature === signature;
}

export async function getVideoUploadLink(req, env) {

    return await createUploadURL(env)
}

async function createUploadURL(env) {
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.CF_STREAM_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                maxDurationSeconds: 600,   // optional
                requireSignedURLs: false   // optional
            })
        }
    )

    const data = await res.json()

    if (!data.success) {
        return new Response(
            JSON.stringify({ error: "Failed to create upload URL" }),
            { status: 500 }
        )
    }

    return new Response(
        JSON.stringify({
            uploadURL: data.result.uploadURL,
            uid: data.result.uid
        }),
        {
            headers: { "Content-Type": "application/json" }
        }
    )
}
