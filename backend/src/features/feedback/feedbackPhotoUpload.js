// Keep report photos private and accept only small, recognizable image files.
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
    deleteStorageObject, downloadStorageObject, isPersistentStorageRequired,
    isSupabaseStorageConfigured, parseStorageMarker, STORAGE_BUCKETS,
    storageMarker, uploadStorageObject,
} from "../../lib/supabaseStorage.js";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const photoDirectory = path.join(backendDirectory, "uploads", "feedback");
export const maxFeedbackPhotoSize = 5 * 1024 * 1024;

const imageTypes = new Map([
    ["image/jpeg", { extension: ".jpg", valid: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
    ["image/png", { extension: ".png", valid: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", valid: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }],
]);

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFeedbackPhotoSize, files: 4, fields: 4, parts: 8 },
}).array("photos", 4);

export function uploadFeedbackPhotos(request, response, next) {
    photoUpload(request, response, (error) => {
        if (error) {
            const message = error.code === "LIMIT_FILE_SIZE"
                ? "Each photo must be 5 MB or smaller."
                : "Choose up to four JPG, PNG, or WebP photos.";
            return response.status(400).json({ success: false, message });
        }
        const files = request.files ?? [];
        if (files.length < 1 || files.length > 4) {
            return response.status(400).json({ success: false, message: "Attach between one and four photos." });
        }
        for (const file of files) {
            const type = [...imageTypes.entries()].find(([, value]) => value.valid(file.buffer));
            if (!type) return response.status(400).json({ success: false, message: "A photo is not a valid JPG, PNG, or WebP image." });
            file.detectedMimeType = type[0];
            file.detectedExtension = type[1].extension;
        }
        return next();
    });
}

export async function storeFeedbackPhoto(file, reportId) {
    if (!file?.buffer || !file.detectedExtension) throw new Error("INVALID_FEEDBACK_PHOTO");
    const fileName = `${randomUUID()}${file.detectedExtension}`;
    if (isPersistentStorageRequired()) {
        if (!isSupabaseStorageConfigured()) throw new Error("FEEDBACK_STORAGE_NOT_CONFIGURED");
        const objectPath = `feedback/${reportId}/${fileName}`;
        await uploadStorageObject(STORAGE_BUCKETS.messages, objectPath, file.buffer, file.detectedMimeType);
        return storageMarker(STORAGE_BUCKETS.messages, objectPath);
    }
    await mkdir(photoDirectory, { recursive: true });
    await writeFile(path.join(photoDirectory, fileName), file.buffer, { flag: "wx" });
    return fileName;
}

export async function readFeedbackPhoto(photoKey) {
    const objectPath = parseStorageMarker(photoKey, STORAGE_BUCKETS.messages);
    if (objectPath?.startsWith("feedback/")) return downloadStorageObject(STORAGE_BUCKETS.messages, objectPath);
    if (typeof photoKey !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(photoKey)) throw new Error("INVALID_FEEDBACK_PHOTO_KEY");
    return readFile(path.join(photoDirectory, photoKey));
}

export async function removeFeedbackPhoto(photoKey) {
    const objectPath = parseStorageMarker(photoKey, STORAGE_BUCKETS.messages);
    if (objectPath?.startsWith("feedback/")) return deleteStorageObject(STORAGE_BUCKETS.messages, objectPath);
    if (typeof photoKey !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(photoKey)) return;
    try { await unlink(path.join(photoDirectory, photoKey)); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export function feedbackPhotoContentType(photoKey) {
    const extension = path.extname(photoKey).toLowerCase();
    return ({ ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extension] ?? "application/octet-stream";
}
