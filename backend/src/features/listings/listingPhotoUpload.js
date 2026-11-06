// Validate listing photos and store them durably on Vercel or locally during development.
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
export const listingUploadDirectory = path.join(backendDirectory, "uploads", "listings");
const maxPhotoSize = 5 * 1024 * 1024;
const supportedTypes = new Map([
    ["image/jpeg", { extension: ".jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
    ["image/png", { extension: ".png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }]
]);

// Keep files in memory until their signatures are checked and the correct storage is selected.
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxPhotoSize, files: 4, fields: 16, parts: 20 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, true);
    }
}).array("photos", 4);

// Accept only the documented image formats based on file bytes, then persist each photo.
export function uploadListingPhoto(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Product photos must be 5 MB or smaller."
                : uploadError.message === "UNSUPPORTED_IMAGE_TYPE"
                    ? "Product photos must be JPG, PNG, or WebP images."
                    : uploadError.code === "LIMIT_UNEXPECTED_FILE"
                        ? "Choose between 2 and 4 JPG, PNG, or WebP product photos."
                        : "Product photos could not be uploaded. Please try again.";
            return response.status(400).json({ success: false, message });
        }

        if (!request.files?.length) return next();

        for (const uploadedPhoto of request.files) {
            const bytes = uploadedPhoto.buffer;
            const type = supportedTypes.get(uploadedPhoto.mimetype);
            if (!Buffer.isBuffer(bytes) || !type?.signature(bytes.subarray(0, 12))) {
                return response.status(400).json({ success: false, message: "A product photo is not a valid JPG, PNG, or WebP image." });
            }
        }

        try {
            if (isPersistentStorageRequired()) {
                if (!isSupabaseStorageConfigured()) {
                    return response.status(503).json({
                        success: false,
                        message: "Product photo storage is not configured for this deployment. Please contact the site administrator."
                    });
                }
                await persistToSupabase(request.files);
            } else {
                await persistLocally(request.files);
            }
            return next();
        } catch (error) {
            await removeListingPhotos(request.files);
            console.error("Product photo upload failed:", error?.code ?? error?.name ?? "UNKNOWN");
            return response.status(502).json({ success: false, message: "Product photos could not be saved. Please try again." });
        }
    });
}

async function persistToSupabase(files) {
    for (const file of files) {
        const type = supportedTypes.get(file.mimetype);
        const objectPath = `listings/${randomUUID()}${type.extension}`;
        file.storageObjectPath = objectPath;
        await uploadStorageObject(STORAGE_BUCKETS.listings, objectPath, file.buffer, file.mimetype);
        file.publicUrl = publicStorageUrl(STORAGE_BUCKETS.listings, objectPath);
    }
}

async function persistLocally(files) {
    await mkdir(listingUploadDirectory, { recursive: true });
    for (const file of files) {
        const type = supportedTypes.get(file.mimetype);
        file.filename = `${randomUUID()}${type.extension}`;
        file.path = path.join(listingUploadDirectory, file.filename);
        await writeFile(file.path, file.buffer, { flag: "wx" });
    }
}

// Clean up every file when validation or database saving rejects the upload.
export async function removeListingPhotos(files = []) {
    await Promise.all((files ?? []).map(async (file) => {
        if (file?.storageObjectPath) {
            try {
                await deleteStorageObject(STORAGE_BUCKETS.listings, file.storageObjectPath);
            } catch (error) {
                console.error("Could not remove an uploaded product photo:", error?.code ?? error?.name ?? "UNKNOWN");
            }
            return;
        }
        await removeListingPhoto(file?.path);
    }));
}

// Remove a temporary upload whenever its listing fails validation or cannot be saved.
export async function removeListingPhoto(filePath) {
    if (!filePath) return;
    try {
        await unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

// Remove only a photo URL owned by this app from its configured storage location.
export async function removeListingPhotoByUrl(photoUrl) {
    const localPrefix = "/api/uploads/listings/";
    if (typeof photoUrl !== "string") return;
    if (photoUrl.startsWith(localPrefix)) {
        let fileName;
        try {
            fileName = decodeURIComponent(photoUrl.slice(localPrefix.length));
        } catch {
            return;
        }
        if (!fileName || path.basename(fileName) !== fileName) return;
        await removeListingPhoto(path.join(listingUploadDirectory, fileName));
        return;
    }

    const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    if (!baseUrl) return;
    const publicPrefix = `${baseUrl}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKETS.listings)}/`;
    if (!photoUrl.startsWith(publicPrefix)) return;
    let objectPath;
    try {
        objectPath = photoUrl.slice(publicPrefix.length).split("/").map(decodeURIComponent).join("/");
    } catch {
        return;
    }
    if (!objectPath || objectPath.startsWith("/") || objectPath.split("/").includes("..")) return;
    await deleteStorageObject(STORAGE_BUCKETS.listings, objectPath);
}

// Persist external URLs in the database and local relative URLs in development.
export function listingPhotoUrl(photo) {
    if (photo?.publicUrl) return photo.publicUrl;
    return `/api/uploads/listings/${encodeURIComponent(photo.filename)}`;
}
