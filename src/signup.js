import json from "./json";

export default async function signup(req, env) {

    const body = await req.json();
    const { email, password, name } = body;

    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const passwordHash = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");

    const id = crypto.randomUUID();

    await env.cldb.prepare(
        "INSERT INTO users (user_id, email, password, name) VALUES (?, ?, ?, ?)"
    ).bind(id, email, passwordHash, name).run();

    return json({ success: true, message: "User created successfully " + name }, 201);

}