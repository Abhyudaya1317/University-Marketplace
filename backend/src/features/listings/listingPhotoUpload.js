// Save listing images under random names and reject oversized or non-image uploads.
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
    limits: { fileSize: maxPhotoSize, files: 2, fields: 16, parts: 18 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, true);
    }
}).array("photos", 2);

// Check each uploaded file's bytes as well as its browser-provided MIME type.
export function uploadListingPhoto(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            await removeListingPhotos(request.files);
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Product photos must be 5 MB or smaller."
                : "Upload up to two JPG, PNG, or WebP product photos.";
            return response.status(400).json({ success: false, message });
        }

        if (!request.files?.length) return next();

        for (const uploadedPhoto of request.files) {
            try {
                const file = await open(uploadedPhoto.path, "r");
                const header = Buffer.alloc(12);
                await file.read(header, 0, header.length, 0);
                await file.close();
                const type = supportedTypes.get(uploadedPhoto.mimetype);
                if (!type?.signature(header)) {
                    await removeListingPhotos(request.files);
                    return response.status(400).json({ success: false, message: "A product photo is not a valid JPG, PNG, or WebP image." });
                }
            } catch {
                await removeListingPhotos(request.files);
                return response.status(400).json({ success: false, message: "The product photos could not be processed." });
            }
        }
        return next();
    });
}

// Clean up every file when validation or database saving rejects the upload.
export async function removeListingPhotos(files = []) {
    await Promise.all((files ?? []).map((file) => removeListingPhoto(file?.path)));
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
