// Access Supabase Storage only from the trusted backend, never from Angular.
export const STORAGE_BUCKETS = Object.freeze({
    listings: "listing-photos",
    profiles: "profile-photos",
    messages: "message-attachments",
});

export function isSupabaseStorageConfigured() {
    return Boolean(process.env.SUPABASE_URL && storageSecretKey());
}

export function isPersistentStorageRequired() {
    return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function storageConfig() {
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const secretKey = storageSecretKey();
    if (!baseUrl || !secretKey) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
    return { baseUrl, secretKey };
}

// Prefer Supabase's current server-only key and keep compatibility with the legacy service_role variable.
function storageSecretKey() {
    return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function encodeObjectPath(objectPath) {
    return objectPath.split("/").map(encodeURIComponent).join("/");
}

function storageUrl(baseUrl, route) {
    return `${baseUrl}/storage/v1/${route}`;
}

async function storageRequest(route, options = {}) {
    const { baseUrl, secretKey } = storageConfig();
    const headers = { apikey: secretKey, ...options.headers };
    // Current sb_secret keys are opaque API keys, not JWTs. Legacy service_role keys are JWTs.
    if (!secretKey.startsWith("sb_secret_") && !headers.Authorization) {
        headers.Authorization = `Bearer ${secretKey}`;
    }
    const response = await fetch(storageUrl(baseUrl, route), {
        ...options,
        headers,
    });
    if (!response.ok) throw new Error(`SUPABASE_STORAGE_HTTP_${response.status}`);
    return response;
}

export function storageMarker(bucket, objectPath) {
    return `supabase-storage://${bucket}/${objectPath}`;
}

export function parseStorageMarker(value, expectedBucket) {
    if (typeof value !== "string") return null;
    const prefix = `supabase-storage://${expectedBucket}/`;
    if (!value.startsWith(prefix)) return null;
    const objectPath = value.slice(prefix.length);
    if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) return null;
    return objectPath;
}

export function publicStorageUrl(bucket, objectPath) {
    const { baseUrl } = storageConfig();
    return storageUrl(baseUrl, `object/public/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`);
}

export async function uploadStorageObject(bucket, objectPath, bytes, contentType) {
    await storageRequest(`object/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`, {
        method: "POST",
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "max-age=31536000",
            "x-upsert": "false",
        },
        body: bytes,
    });
}

export async function deleteStorageObject(bucket, objectPath) {
    await storageRequest(`object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [objectPath] }),
    });
}

export async function downloadStorageObject(bucket, objectPath) {
    const response = await storageRequest(`object/authenticated/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`);
    return Buffer.from(await response.arrayBuffer());
}
