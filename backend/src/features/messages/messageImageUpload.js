// Keep chat attachments private; downloads are served only after checking conversation membership.
import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const messageImageDirectory = path.join(backendDirectory, "uploads", "messages");
export const maxMessageFileSize = 10 * 1024 * 1024;

// Accept common image and document formats, with a byte signature for each binary format.
const supportedTypes = new Map([
    ["image/jpeg", { extension: ".jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
    ["image/png", { extension: ".png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ["image/webp", { extension: ".webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }],
    ["application/pdf", { extension: ".pdf", signature: (bytes) => bytes.toString("ascii", 0, 5) === "%PDF-" }],
    ["text/plain", { extension: ".txt", text: true }],
    ["text/csv", { extension: ".csv", text: true }],
]);

// Generate opaque filenames so the sender's original path/name is never used on disk.
const messageFileUpload = multer({
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
            const type = supportedTypes.get(file.mimetype);
            if (!type) return callback(new Error("UNSUPPORTED_MESSAGE_FILE_TYPE"));
            callback(null, `${randomUUID()}${type.extension}`);
        },
    }),
    limits: { fileSize: maxMessageFileSize, files: 1, fields: 1, parts: 2 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_MESSAGE_FILE_TYPE"));
        callback(null, true);
    },
}).single("file");

// Check the actual file bytes before a message is allowed to reference the upload.
export function uploadMessageFile(request, response, next) {
    messageFileUpload(request, response, async (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Chat files must be 10 MB or smaller."
                : "Choose a JPG, PNG, WebP, PDF, TXT, or CSV file.";
            return response.status(400).json({ success: false, message });
        }
        if (!request.file) return response.status(400).json({ success: false, message: "Choose a file to send." });

        try {
            const file = await open(request.file.path, "r");
            const header = Buffer.alloc(16);
            const { bytesRead } = await file.read(header, 0, header.length, 0);
            await file.close();
            const type = supportedTypes.get(request.file.mimetype);
            const validText = type?.text && !header.subarray(0, bytesRead).includes(0);
            if (!type || !(type.text ? validText : type.signature(header))) {
                await unlink(request.file.path);
                return response.status(400).json({ success: false, message: "The file contents do not match its file type." });
            }
            return next();
        } catch {
            await removeMessageImage(request.file.filename);
            return response.status(400).json({ success: false, message: "The file could not be processed." });
        }
    });
}

// Remove only generated filenames with a supported extension from the private upload folder.
export async function removeMessageImage(fileName) {
    if (typeof fileName !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt|csv)$/i.test(fileName)) return;
    try {
        await unlink(path.join(messageImageDirectory, fileName));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

// The stored MIME type is selected from the allowlist and extension, never user input.
export function messageFileContentType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return ({ ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8" })[extension] ?? null;
}

export const messageImageContentType = messageFileContentType;
