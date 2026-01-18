import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

export async function createToken(payload, secret) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(encoder.encode(secret));
}

export async function verifyToken(token, secret) {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return payload;
}
export async function requireAuth(req, env) {
    const header = req.headers.get("Authorization");
    if (!header) return null;
    const token = header.replace("Bearer ", "");
    try {
        return await verifyToken(token, env.JWT_SECRET);
    } catch {
        return null;
    }
}