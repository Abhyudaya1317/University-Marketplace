// Save optional listing images under random names and reject oversized or non-image uploads.
import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const listingUploadDirectory = path.join(backendDirectory, "uploads", "listings");
const maxPhotoSize = 5 * 1024 * 1024;
const supportedTypes = new Map([
    ["image/jpeg", { extension: ".jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
    ["image/png", { extension: ".png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }]
]);

// Generate opaque file names so original names and paths never become public URLs.
const storage = multer.diskStorage({
    destination: async (_request, _file, callback) => {
        try {
            await mkdir(listingUploadDirectory, { recursive: true });
            callback(null, listingUploadDirectory);
        } catch (error) {
            callback(error);
        }
    },
    filename: (_request, file, callback) => {
        const type = supportedTypes.get(file.mimetype);
        if (!type) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, `${randomUUID()}${type.extension}`);
    }
});

const imageUpload = multer({
    storage,
    limits: { fileSize: maxPhotoSize, files: 1, fields: 12, parts: 13 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, true);
    }
}).single("photo");

// Check actual file bytes as well as the browser-provided MIME type before accepting an image.
export function uploadListingPhoto(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Product photos must be 5 MB or smaller."
                : "Upload one JPG, PNG, or WebP product photo.";
            return response.status(400).json({ success: false, message });
        }

        if (!request.file) return next();

        try {
            const file = await open(request.file.path, "r");
            const header = Buffer.alloc(12);
            await file.read(header, 0, header.length, 0);
            await file.close();
            const type = supportedTypes.get(request.file.mimetype);
            if (!type?.signature(header)) {
                await unlink(request.file.path);
                return response.status(400).json({ success: false, message: "The uploaded file is not a valid JPG, PNG, or WebP image." });
            }
            return next();
        } catch {
            await removeListingPhoto(request.file.path);
            return response.status(400).json({ success: false, message: "The product photo could not be processed." });
        }
    });
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

// Resolve only a photo URL created by this service before deleting its local file.
export async function removeListingPhotoByUrl(photoUrl) {
    const prefix = "/api/uploads/listings/";
    if (typeof photoUrl !== "string" || !photoUrl.startsWith(prefix)) return;

    let fileName;
    try {
        fileName = decodeURIComponent(photoUrl.slice(prefix.length));
    } catch {
        return;
    }
    if (!fileName || path.basename(fileName) !== fileName) return;

    await removeListingPhoto(path.join(listingUploadDirectory, fileName));
}

// Express serves only this dedicated folder for public listing photos.
export const listingPhotoUrl = (fileName) => `/api/uploads/listings/${encodeURIComponent(fileName)}`;
