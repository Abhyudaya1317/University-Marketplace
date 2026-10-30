// Keep direct messages short enough to read and safe to store as plain text.
export function normalizeMessageBody(value) {
    if (typeof value !== "string") return null;
    const body = value.trim();
    return body.length >= 1 && body.length <= 2000 ? body : null;
}
