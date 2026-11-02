// Store profile photos separately from listings and validate both file type and size.
import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const profileUploadDirectory = path.join(backendDirectory, "uploads", "profiles");
const maxPhotoSize = 5 * 1024 * 1024;
const supportedTypes = new Map([
    ["image/jpeg", { extension: ".jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
    ["image/png", { extension: ".png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }],
]);

const storage = multer.diskStorage({
    destination: async (_request, _file, callback) => {
        try {
            await mkdir(profileUploadDirectory, { recursive: true });
            callback(null, profileUploadDirectory);
        } catch (error) {
            callback(error);
        }
    },
    filename: (_request, file, callback) => {
        const type = supportedTypes.get(file.mimetype);
        if (!type) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, `${randomUUID()}${type.extension}`);
    },
});

const imageUpload = multer({
    storage,
    limits: { fileSize: maxPhotoSize, files: 1, fields: 0, parts: 1 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, true);
    },
}).single("photo");

// Reject missing, oversized, or mislabeled images before the profile is updated.
export function uploadProfilePhoto(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            await removeProfilePhoto(request.file?.path);
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Profile photos must be 5 MB or smaller."
                : "Choose one JPG, PNG, or WebP profile photo.";
            return response.status(400).json({ success: false, message });
        }
        if (!request.file) return response.status(400).json({ success: false, message: "Choose a profile photo to upload." });

        try {
            const file = await open(request.file.path, "r");
            const header = Buffer.alloc(12);
            await file.read(header, 0, header.length, 0);
            await file.close();
            const type = supportedTypes.get(request.file.mimetype);
            if (!type?.signature(header)) {
                await removeProfilePhoto(request.file.path);
                return response.status(400).json({ success: false, message: "The selected file is not a valid JPG, PNG, or WebP image." });
            }
        } catch {
            await removeProfilePhoto(request.file.path);
            return response.status(400).json({ success: false, message: "The profile photo could not be processed." });
        }
        return next();
    });
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

// Delete only files whose URLs were created by this profile-photo service.
export async function removeProfilePhotoByUrl(photoUrl) {
    const prefix = "/api/uploads/profiles/";
    if (typeof photoUrl !== "string" || !photoUrl.startsWith(prefix)) return;
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
