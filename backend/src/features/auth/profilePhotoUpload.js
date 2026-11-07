// Store profile photos separately from listings and validate both file type and size.
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
    deleteStorageObject,
    isPersistentStorageRequired,
    isSupabaseStorageConfigured,
    publicStorageUrl,
    STORAGE_BUCKETS,
    uploadStorageObject
} from "../../lib/supabaseStorage.js";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const profileUploadDirectory = path.join(backendDirectory, "uploads", "profiles");
const maxPhotoSize = 5 * 1024 * 1024;
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxPhotoSize, files: 1, fields: 4, parts: 5 },
}).single("photo");

// Read one image into memory, validate its bytes, then save it to durable storage in production.
export function uploadProfilePhoto(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Profile photos must be 5 MB or smaller."
                : uploadError.code === "LIMIT_UNEXPECTED_FILE"
                    ? "Upload one profile photo at a time."
                    : "Profile photo upload failed. Please choose one JPG, PNG, or WebP image and try again.";
            return response.status(400).json({ success: false, message });
        }
        if (!request.file) return response.status(400).json({ success: false, message: "Choose one profile photo to upload." });

        const type = detectImageType(request.file.buffer);
        if (!type) {
            return response.status(400).json({ success: false, message: "The selected file is not a valid JPG, PNG, or WebP image." });
        }
        try {
            if (isPersistentStorageRequired()) {
                if (!isSupabaseStorageConfigured()) {
                    return response.status(503).json({
                        success: false,
                        message: "Profile photo storage is not configured for this deployment. Please contact the site administrator."
                    });
                }
                const objectPath = `profiles/${randomUUID()}${type.extension}`;
                await uploadStorageObject(STORAGE_BUCKETS.listings, objectPath, request.file.buffer, type.contentType);
                request.file.storageBucket = STORAGE_BUCKETS.listings;
                request.file.storageObjectPath = objectPath;
                request.file.publicUrl = publicStorageUrl(STORAGE_BUCKETS.listings, objectPath);
            } else {
                await mkdir(profileUploadDirectory, { recursive: true });
                request.file.filename = `${randomUUID()}${type.extension}`;
                request.file.path = path.join(profileUploadDirectory, request.file.filename);
                await writeFile(request.file.path, request.file.buffer, { flag: "wx" });
            }
            return next();
        } catch (error) {
            await removeUploadedProfilePhoto(request.file);
            console.error("Profile photo storage failed:", error?.code ?? error?.name ?? "UNKNOWN");
            return response.status(502).json({ success: false, message: "Your profile photo could not be saved. Please try again." });
        }
    });
}

function detectImageType(bytes) {
    if (!Buffer.isBuffer(bytes)) return null;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return { extension: ".jpg", contentType: "image/jpeg" };
    }
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { extension: ".png", contentType: "image/png" };
    }
    if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
        return { extension: ".webp", contentType: "image/webp" };
    }
    return null;
}

// Remove an upload when the database update fails, without surfacing filesystem details.
export async function removeProfilePhoto(filePath) {
    if (!filePath) return;
    try {
        await unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

// Clean either a local development image or a production object after a failed profile update.
export async function removeUploadedProfilePhoto(file) {
    if (file?.storageBucket && file?.storageObjectPath) {
        try {
            await deleteStorageObject(file.storageBucket, file.storageObjectPath);
        } catch (error) {
            console.error("Could not remove an uploaded profile photo:", error?.code ?? error?.name ?? "UNKNOWN");
        }
        return;
    }
    await removeProfilePhoto(file?.path);
}

// Delete only files whose URLs were created by this profile-photo service.
export async function removeProfilePhotoByUrl(photoUrl) {
    const prefix = "/api/uploads/profiles/";
    if (typeof photoUrl !== "string") return;
    if (!photoUrl.startsWith(prefix)) {
        const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
        const publicPrefix = baseUrl
            ? `${baseUrl}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKETS.listings)}/profiles/`
            : "";
        if (!publicPrefix || !photoUrl.startsWith(publicPrefix)) return;
        let objectPath;
        try {
            objectPath = `profiles/${photoUrl.slice(publicPrefix.length).split("/").map(decodeURIComponent).join("/")}`;
        } catch {
            return;
        }
        if (objectPath.includes("..")) return;
        await deleteStorageObject(STORAGE_BUCKETS.listings, objectPath);
        return;
    }
    let fileName;
    try {
        fileName = decodeURIComponent(photoUrl.slice(prefix.length));
    } catch {
        return;
    }
    if (!fileName || path.basename(fileName) !== fileName) return;
    await removeProfilePhoto(path.join(profileUploadDirectory, fileName));
}

export const profilePhotoUrl = (fileName) => `/api/uploads/profiles/${encodeURIComponent(fileName)}`;
