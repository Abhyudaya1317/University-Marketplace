// Keep chat attachments private and durable in production; local development uses disk storage.
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import {
    deleteStorageObject,
    downloadStorageObject,
    isPersistentStorageRequired,
    isSupabaseStorageConfigured,
    parseStorageMarker,
    STORAGE_BUCKETS,
    storageMarker,
    uploadStorageObject,
} from "../../lib/supabaseStorage.js";

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

// Buffer the request briefly; persist it only after the controller verifies conversation membership.
const messageFileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMessageFileSize, files: 1, fields: 1, parts: 2 },
    fileFilter: (_request, file, callback) => {
        if (!supportedTypes.has(file.mimetype)) return callback(new Error("UNSUPPORTED_MESSAGE_FILE_TYPE"));
        callback(null, true);
    },
}).single("file");

// Validate actual bytes before any attachment reaches persistent storage.
export function uploadMessageFile(request, response, next) {
    messageFileUpload(request, response, (uploadError) => {
        if (uploadError) {
            const message = uploadError.code === "LIMIT_FILE_SIZE"
                ? "Chat files must be 10 MB or smaller."
                : "Choose a JPG, PNG, WebP, PDF, TXT, or CSV file.";
            return response.status(400).json({ success: false, message });
        }
        if (!request.file) return response.status(400).json({ success: false, message: "Choose a file to send." });

        const file = request.file;
        const header = file.buffer.subarray(0, 16);
        const type = supportedTypes.get(file.mimetype);
        const validText = type?.text && !header.includes(0);
        if (!type || !(type.text ? validText : type.signature(header))) {
            return response.status(400).json({ success: false, message: "The file contents do not match its file type." });
        }
        file.messageExtension = type.extension;
        return next();
    });
}

// Store the file only after authorization; return the opaque name saved with the message row.
export async function storeMessageImage(file, conversationId) {
    if (!file?.buffer || !file.messageExtension) throw new Error("INVALID_MESSAGE_ATTACHMENT");
    const generatedName = `${randomUUID()}${file.messageExtension}`;

    if (isPersistentStorageRequired()) {
        if (!isSupabaseStorageConfigured()) throw new Error("MESSAGE_STORAGE_NOT_CONFIGURED");
        const objectPath = `conversations/${conversationId}/${generatedName}`;
        await uploadStorageObject(STORAGE_BUCKETS.messages, objectPath, file.buffer, file.mimetype);
        return storageMarker(STORAGE_BUCKETS.messages, objectPath);
    }

    await mkdir(messageImageDirectory, { recursive: true });
    await writeFile(path.join(messageImageDirectory, generatedName), file.buffer, { flag: "wx" });
    return generatedName;
}

// Remove a private Storage object or a local development file using only generated names.
export async function removeMessageImage(fileName) {
    const objectPath = parseStorageMarker(fileName, STORAGE_BUCKETS.messages);
    if (objectPath) {
        await deleteStorageObject(STORAGE_BUCKETS.messages, objectPath);
        return;
    }
    if (typeof fileName !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt|csv)$/i.test(fileName)) return;
    try {
        await unlink(path.join(messageImageDirectory, fileName));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

// Retrieve private files through the backend service key; clients never get a Storage URL.
export async function readMessageImage(fileName) {
    const objectPath = parseStorageMarker(fileName, STORAGE_BUCKETS.messages);
    if (objectPath) return downloadStorageObject(STORAGE_BUCKETS.messages, objectPath);
    if (typeof fileName !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt|csv)$/i.test(fileName)) {
        throw new Error("INVALID_MESSAGE_ATTACHMENT_NAME");
    }
    return readFile(path.join(messageImageDirectory, fileName));
}

// The stored MIME type is selected from the allowlist and extension, never user input.
export function messageFileContentType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return ({ ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8" })[extension] ?? null;
}

export const messageImageContentType = messageFileContentType;
