async function hashPassword(password) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(password)
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}