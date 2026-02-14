import { requireAuth } from "../users/auth";
import json from "../util/json";
import { updateImage, uploadImage, deleteImage } from "../util/upload";

export async function coursesbatchpost(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const id = crypto.randomUUID();
        let name, course_id, duration, batch_image;

        const contentType = req.headers.get("Content-Type") || "";

        //use uploadImage for cloudflare images

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();

            name = formData.get("name");
            course_id = formData.get("course_id");
            duration = formData.get("duration");

            const file = formData.get("batch_image");

            if (file instanceof File) {
                console.log(file);
                batch_image = await uploadImage(file, env);
                batch_image = batch_image.result.variants[0];
            }
        } else {
            name = req.name;
            course_id = req.course_id;
            duration = req.duration;
            batch_image = req.batch_image;
        }

        const created_at = new Date().toISOString();

        await env.cldb.prepare(
            "INSERT INTO batch (batch_id, name, batch_image, course_id, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, name, batch_image, course_id, duration, created_at).run();

        return json({ success: true, message: "Batch created successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchget(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const course_id = url.searchParams.get("course_id");

        let query = "SELECT batch_id, name, batch_image, duration, created_at FROM batch where course_id = ?";
        const params = [course_id];

        const stmt = env.cldb.prepare(query);
        const result = await stmt.bind(...params).all();

        return json({ batch: result.results });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchdelete(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const batch_id = url.searchParams.get("batch_id");

        if (!batch_id) {
            return json({ error: "batch_id is required" }, 400);
        }
        const batchRow = await env.cldb
            .prepare(
                "SELECT batch_image FROM batch WHERE batch_id = ?"
            )
            .bind(batch_id)
            .first();

        await deleteImage(batchRow.batch_image, env);
        await env.cldb.prepare(
            "DELETE FROM batch WHERE batch_id = ?"
        ).bind(batch_id).run();

        return json({ success: true, message: "Batch deleted successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function coursesbatchput(req, env) {
    try {
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(req.url);
        const batch_id = url.searchParams.get("batch_id");

        if (!batch_id) {
            return json({ error: "batch_id is required" }, 400);
        }

        const formData = await req.formData();
        const name = formData.get("name");
        const duration = formData.get("duration");
        const file = formData.get("batch_image");
        let batch_image;
        const batchRow = await env.cldb
            .prepare(
                "SELECT batch_image FROM batch WHERE batch_id = ?"
            )
            .bind(batch_id)
            .first();
        if (!batchRow) {
            return json({ error: "Batch not found" }, 404);
        }
        if (file instanceof File) {
            const updated = await updateImage(file, batchRow.batch_image.split("/")[batchRow.batch_image.split("/").length - 2], env);
            batch_image = updated.imageUrl;
        } else {
            batch_image = batchRow.batch_image;
        }

        const updated_at = new Date().toISOString();

        await env.cldb.prepare(
            "UPDATE batch SET name = ?, batch_image = ?, duration = ?, updated_at = ? WHERE batch_id = ?"
        ).bind(name, batch_image, duration, updated_at, batch_id).run();

        return json({ success: true, message: "Batch updated successfully" });
    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"; // cleaner chars

function generateCode(length = 6) {
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);

    let code = "";
    for (let i = 0; i < length; i++) {
        code += CHARS[arr[i] % CHARS.length];
    }
    return code;
}

export async function genbatchcode(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { batch_id } = await req.json();

        if (!batch_id) {
            return json({ error: "batch_id required" }, 400);
        }

        // 1️⃣ Check if batch already has a code
        const existingBatch = await env.cldb
            .prepare("SELECT code FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!existingBatch) {
            return json({ error: "Batch not found" }, 404);
        }

        if (existingBatch.code) {
            return json({
                success: true,
                message: "Batch already has a code",
                batch_code: existingBatch.code
            });
        }

        let attempts = 0;
        let batch_code = null;

        // 2️⃣ Generate unique code
        while (attempts < 10) {
            const code = generateCode(6);

            const exists = await env.cldb
                .prepare("SELECT batch_id FROM batch WHERE code = ?")
                .bind(code)
                .first();

            if (!exists) {
                batch_code = code;
                break;
            }

            attempts++;
        }

        if (!batch_code) {
            return json(
                { error: "Failed to generate unique batch code" },
                500
            );
        }

        // 3️⃣ Save generated code
        await env.cldb
            .prepare("UPDATE batch SET code = ? WHERE batch_id = ?")
            .bind(batch_code, batch_id)
            .run();

        return json({
            success: true,
            message: "Batch code generated",
            batch_code
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function deletebatchcode(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        const { batch_id } = await req.json();

        if (!batch_id) {
            return json({ error: "batch_id required" }, 400);
        }

        // 1️⃣ Check batch exists + current code
        const batch = await env.cldb
            .prepare("SELECT code FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Batch not found" }, 404);
        }

        if (!batch.code) {
            return json({
                success: true,
                message: "Batch already has no code"
            });
        }

        // 2️⃣ Remove the code
        await env.cldb
            .prepare("UPDATE batch SET code = NULL WHERE batch_id = ?")
            .bind(batch_id)
            .run();

        return json({
            success: true,
            message: "Batch code deleted"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchreq(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { batch_id, code } = await req.json();

    if (!batch_id || !code) {
        return json({ error: "batch_id and code required" }, 400);
    }

    if (user.role !== "student") {
        return json({ error: "Only students can join batches" }, 403);
    }

    const batch = await env.cldb
        .prepare("SELECT * FROM batch WHERE batch_id = ? AND code = ?")
        .bind(batch_id, code)
        .first();
    if (!batch) {
        return json({ error: "Invalid batch_id or code" }, 404);
    } else {
        const uid = crypto.randomUUID();

        await env.cldb.prepare("INSERT INTO batch_join_requests (request_id, batch_id, student_id, status, created_at) VALUES (?, ?, ?, ?, ?)").bind(uid, batch.batch_id, user.id, "pending", new Date().toISOString()).run();
    }

    return json({
        success: true,
        message: "Request created successfully"
    });
}

export async function batchreqget(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (user.role !== "admin") {
        return json({ error: "Only admins can get batch requests" }, 403);
    }

    const { batch_id } = await req.json();
    var requests;

    if (!batch_id) {
        requests = await env.cldb.prepare("SELECT * FROM batch_join_requests").all();
    } else {
        const batch = await env.cldb
            .prepare("SELECT * FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();
        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        } else {
            requests = await env.cldb.prepare("SELECT * FROM batch_join_requests WHERE batch_id = ?").bind(batch_id).all();
        }
    }

    return json({
        success: true,
        requests: requests
    });
}

export async function batchreqaccept(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can accept batch requests" },
                403
            );
        }

        const { request_id } = await req.json();

        if (!request_id) {
            return json({ error: "request_id required" }, 400);
        }

        // 1️⃣ Get request
        const request = await env.cldb
            .prepare("SELECT * FROM batch_join_requests WHERE request_id = ?")
            .bind(request_id)
            .first();

        if (!request) {
            return json({ error: "Invalid request_id" }, 404);
        }

        // Optional safety: already handled
        if (request.status === "accepted") {
            return json({
                success: true,
                message: "Request already accepted"
            });
        }

        // 2️⃣ Validate batch exists
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(request.batch_id)
            .first();

        if (!batch) {
            return json({ error: "Batch not found" }, 404);
        }

        // 3️⃣ Add student to batch_students
        // INSERT OR IGNORE prevents duplicate crashes
        await env.cldb
            .prepare(
                `
                INSERT OR IGNORE INTO batch_students
                (batch_id, student_id, joined_at)
                VALUES (?, ?, ?)
                `
            )
            .bind(
                request.batch_id,
                request.student_id,
                new Date().toISOString()
            )
            .run();

        // 4️⃣ Mark request accepted
        await env.cldb
            .prepare(
                "UPDATE batch_join_requests SET status = ? WHERE request_id = ?"
            )
            .bind("accepted", request_id)
            .run();

        return json({
            success: true,
            message: "Request accepted successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function deletebatchreq(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can delete batch requests" },
                403
            );
        }

        const { action, request_id } = await req.json();

        // OPTION 1️⃣ delete single request
        if (action === "single") {

            if (!request_id) {
                return json({ error: "request_id required" }, 400);
            }

            const exists = await env.cldb
                .prepare(
                    "SELECT request_id FROM batch_join_requests WHERE request_id = ?"
                )
                .bind(request_id)
                .first();

            if (!exists) {
                return json({ error: "Invalid request_id" }, 404);
            }

            await env.cldb
                .prepare(
                    "DELETE FROM batch_join_requests WHERE request_id = ?"
                )
                .bind(request_id)
                .run();

            return json({
                success: true,
                message: "Request deleted successfully"
            });
        }

        // OPTION 2️⃣ delete all accepted
        if (action === "accepted_all") {

            const result = await env.cldb
                .prepare(
                    "DELETE FROM batch_join_requests WHERE status = ?"
                )
                .bind("accepted")
                .run();

            return json({
                success: true,
                message: "All accepted requests deleted",
                deleted_count: result.meta?.changes || 0
            });
        }

        return json(
            { error: "Invalid action" },
            400
        );

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchreqreject(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can reject batch requests" },
                403
            );
        }

        const { request_id } = await req.json();

        if (!request_id) {
            return json({ error: "request_id required" }, 400);
        }

        // 1️⃣ Get request
        const request = await env.cldb
            .prepare(
                "SELECT * FROM batch_join_requests WHERE request_id = ?"
            )
            .bind(request_id)
            .first();

        if (!request) {
            return json({ error: "Invalid request_id" }, 404);
        }

        // Optional safety: already handled
        if (request.status === "rejected") {
            return json({
                success: true,
                message: "Request already rejected"
            });
        }

        // 2️⃣ Mark request rejected
        await env.cldb
            .prepare(
                "UPDATE batch_join_requests SET status = ? WHERE request_id = ?"
            )
            .bind("rejected", request_id)
            .run();

        return json({
            success: true,
            message: "Request rejected successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchassignteacher(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can assign teachers to batches" },
                403
            );
        }

        const { batch_id, teacher_id } = await req.json();

        if (!batch_id || !teacher_id) {
            return json({ error: "batch_id and teacher_id required" }, 400);
        }

        // 1️⃣ Validate batch
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        }

        // 2️⃣ Validate teacher
        const teacher = await env.cldb
            .prepare(
                "SELECT user_id FROM users WHERE user_id = ? AND role = 'teacher'"
            )
            .bind(teacher_id)
            .first();

        if (!teacher) {
            return json({ error: "Invalid teacher_id" }, 404);
        }

        // 3️⃣ Add teacher to batch_teachers
        // INSERT OR IGNORE avoids duplicates safely
        await env.cldb
            .prepare(
                `
                INSERT OR IGNORE INTO batch_teachers
                (batch_id, teacher_id, joined_at)
                VALUES (?, ?, ?)
                `
            )
            .bind(
                batch_id,
                teacher_id,
                new Date().toISOString()
            )
            .run();

        return json({
            success: true,
            message: "Teacher assigned to batch successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchremoveteacher(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can remove teachers from batches" },
                403
            );
        }

        const { batch_id, teacher_id } = await req.json();

        if (!batch_id || !teacher_id) {
            return json({ error: "batch_id and teacher_id required" }, 400);
        }

        // 1️⃣ Validate batch exists
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        }

        // 2️⃣ Check teacher assignment exists
        const assignment = await env.cldb
            .prepare(
                "SELECT 1 FROM batch_teachers WHERE batch_id = ? AND teacher_id = ?"
            )
            .bind(batch_id, teacher_id)
            .first();

        if (!assignment) {
            return json({
                error: "Teacher is not assigned to this batch"
            }, 404);
        }

        // 3️⃣ Remove teacher from batch
        await env.cldb
            .prepare(
                "DELETE FROM batch_teachers WHERE batch_id = ? AND teacher_id = ?"
            )
            .bind(batch_id, teacher_id)
            .run();

        return json({
            success: true,
            message: "Teacher removed from batch successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchteachersget(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can get batch teachers" },
                403
            );
        }

        const { batch_id } = await req.json();

        if (!batch_id) {
            return json({ error: "batch_id required" }, 400);
        }

        // 1️⃣ Validate batch exists
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        }

        // 2️⃣ Get teachers for this batch
        const teachers = await env.cldb
            .prepare(
                `
                SELECT
                    u.user_id,
                    u.name,
                    u.email,
                    u.phone,
                    u.profile_image,
                    bt.joined_at
                FROM batch_teachers bt
                JOIN users u ON bt.teacher_id = u.user_id
                WHERE bt.batch_id = ?
                ORDER BY bt.joined_at ASC
                `
            )
            .bind(batch_id)
            .all();

        return json({
            success: true,
            batch_id,
            teachers: teachers.results
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchstudentsget(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can get batch students" },
                403
            );
        }

        const { batch_id } = await req.json();

        if (!batch_id) {
            return json({ error: "batch_id required" }, 400);
        }

        // 1️⃣ Validate batch exists
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        }

        // 2️⃣ Get students for this batch
        const students = await env.cldb
            .prepare(
                `
                SELECT
                    u.user_id,
                    u.name,
                    u.email,
                    u.phone,
                    u.profile_image,
                    bs.joined_at
                FROM batch_students bs
                JOIN users u ON bs.student_id = u.user_id
                WHERE bs.batch_id = ?
                ORDER BY bs.joined_at ASC
                `
            )
            .bind(batch_id)
            .all();

        return json({
            success: true,
            batch_id,
            students: students.results
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}

export async function batchstudentsremove(req, env) {
    try {
        // Auth
        const user = await requireAuth(req, env);
        if (!user) return json({ error: "Unauthorized" }, 401);

        if (user.role !== "admin") {
            return json(
                { error: "Only admins can remove batch students" },
                403
            );
        }

        const { batch_id, student_id } = await req.json();

        if (!batch_id || !student_id) {
            return json({ error: "batch_id and student_id required" }, 400);
        }

        // 1️⃣ Validate batch exists
        const batch = await env.cldb
            .prepare("SELECT batch_id FROM batch WHERE batch_id = ?")
            .bind(batch_id)
            .first();

        if (!batch) {
            return json({ error: "Invalid batch_id" }, 404);
        }

        // 2️⃣ Check student membership
        const membership = await env.cldb
            .prepare(
                "SELECT 1 FROM batch_students WHERE batch_id = ? AND student_id = ?"
            )
            .bind(batch_id, student_id)
            .first();

        if (!membership) {
            return json(
                { error: "Student is not part of this batch" },
                404
            );
        }

        // 3️⃣ Remove student from batch
        await env.cldb
            .prepare(
                "DELETE FROM batch_students WHERE batch_id = ? AND student_id = ?"
            )
            .bind(batch_id, student_id)
            .run();

        return json({
            success: true,
            message: "Student removed from batch successfully"
        });

    } catch (error) {
        return json({ error: error.message || error }, 500);
    }
}
