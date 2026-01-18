import json from "./json";
import { createToken, verifyToken } from "./auth";

export default async function login(req, env) {
            const { email, password } = await req.json();

            const result = await env.cldb.prepare(
                "SELECT user_id, password, role FROM users WHERE email = ?"
            ).bind(email).first();

            if (!result) return json({ error: "User not found" }, 401);

            // Hash incoming password
            const hash = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(password)
            );

            const passwordHash = [...new Uint8Array(hash)]
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");

            if (passwordHash !== result.password)
                return json({ error: "Invalid password" }, 401);

            // 🔥 Update last_login
            await env.cldb.prepare(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?"
            ).bind(result.user_id).run();

            const token = await createToken(
                { user_id: result.user_id, role: result.role },
                env.JWT_SECRET
            );

            return json({ token });
        }