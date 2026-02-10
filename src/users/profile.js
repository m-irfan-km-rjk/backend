import json from "../util/json";
import { requireAuth } from "./auth";

import { uploadFileToStorage } from "../util/upload";

export async function profileget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const user_id = user.user_id;

    const result = await env.cldb.prepare(
        "SELECT * FROM users WHERE user_id = ?"
    ).bind(user_id).first();

    return json({ user: result, success: true, message: "Profile fetched successfully " + user });
}
export async function profileput(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const { name, role, email, phone } = body;
    await env.cldb.prepare(
        "UPDATE users SET name = ?, role = ?, email = ?, phone = ? WHERE user_id = ?"
    ).bind(name, role, email, phone, user.user_id).run();
    return json({ success: true, message: "Profile updated successfully" });
}

export async function profileimageput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const formData = await req.formData();
        const file = formData.get("image");

        if (!file || !(file instanceof File)) {
            return json({ error: "Image file is required" }, 400);
        }

        const image = await uploadFileToStorage(
            file,
            `users/${user.user_id}`,
            "profile",
            env
        );

        await env.cldb.prepare(
            "UPDATE users SET image = ? WHERE user_id = ?"
        ).bind(image, user.user_id).run();

        return json({ success: true, message: "Profile image updated successfully", image });
    } catch (e) {
        return json({ error: e.message || e }, 500);
    }
}