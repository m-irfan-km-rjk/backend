import json from "./json";

export  async function videoget(req, env) {
    const key = "courses/subjects/units/videos/song.mp4";
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 // 1 hour
    );
    return json({ url: signedUrl });
}
export  async function videoput(req, env) {
    const key = "courses/subjects/units/videos/song.mp4";
    const signedUrl = await env.files.createSignedUrl(
        key,
        60 * 60 // 1 hour
    );
    return json({ url: signedUrl });
}
