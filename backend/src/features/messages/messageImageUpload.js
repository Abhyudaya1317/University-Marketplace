// Keep chat images private on disk; the only download path checks chat membership.
import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const messageImageDirectory = path.join(backendDirectory, "uploads", "messages");
const maxImageSize = 5 * 1024 * 1024;
const imageTypes = new Map([
    ["image/jpeg", { extension: ".jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
    ["image/png", { extension: ".png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }]
]);

// Replace the original name with a random one and cap uploads at five megabytes.
const imageUpload = multer({
    storage: multer.diskStorage({
        destination: async (_request, _file, callback) => {
            try {
                await mkdir(messageImageDirectory, { recursive: true });
                callback(null, messageImageDirectory);
            } catch (error) {
                callback(error);
            }
        },
        filename: (_request, file, callback) => {
            const type = imageTypes.get(file.mimetype);
            if (!type) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
            callback(null, `${randomUUID()}${type.extension}`);
        }
    }),
    limits: { fileSize: maxImageSize, files: 1, fields: 1, parts: 2 },
    fileFilter: (_request, file, callback) => {
        if (!imageTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
        callback(null, true);
    }
}).single("image");

// Check file bytes as well as the browser MIME type before saving an image message.
export function uploadMessageImage(request, response, next) {
    imageUpload(request, response, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Chat images must be 5 MB or smaller."
                : "Choose one JPG, PNG, or WebP image.";
            return response.status(400).json({ success: false, message });
        }
        if (!request.file) return response.status(400).json({ success: false, message: "Choose an image to send." });

        try {
            const file = await open(request.file.path, "r");
            const header = Buffer.alloc(12);
            await file.read(header, 0, header.length, 0);
            await file.close();
            const type = imageTypes.get(request.file.mimetype);
            if (!type?.signature(header)) {
                await unlink(request.file.path);
                return response.status(400).json({ success: false, message: "The file is not a valid supported image." });
            }
            return next();
        } catch {
            await removeMessageImage(request.file.filename);
            return response.status(400).json({ success: false, message: "The image could not be processed." });
        }
    });
}

// Delete only an opaque generated filename from the private chat image folder.
export async function removeMessageImage(fileName) {
    if (typeof fileName !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(fileName)) return;
    try {
        await unlink(path.join(messageImageDirectory, fileName));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

// Return the content type only for extensions assigned by the upload validator.
export function messageImageContentType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : null;
}
