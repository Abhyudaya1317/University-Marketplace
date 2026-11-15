// Add lightweight browser-origin checks and per-process abuse limits for this small marketplace.
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const windows = new Map();

// Drop expired counters periodically so a long-running local server does not grow this map forever.
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
        if (entry.resetAt <= now) windows.delete(key);
    }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

export function createRateLimiter({ name, limit, windowMs, methods, key = (request) => request.ip ?? "unknown" }) {
    return (request, response, next) => {
        if (methods && !methods.has(request.method)) return next();
        const now = Date.now();
        const counterKey = `${name}:${key(request)}`;
        let entry = windows.get(counterKey);
        if (!entry || entry.resetAt <= now) {
            if (windows.size >= 10_000) {
                const oldestKey = windows.keys().next().value;
                if (oldestKey !== undefined) windows.delete(oldestKey);
            }
            entry = { count: 0, resetAt: now + windowMs };
            windows.set(counterKey, entry);
        }

        entry.count += 1;
        if (entry.count > limit) {
            const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            response.setHeader("Retry-After", String(retryAfterSeconds));
            return response.status(429).json({ success: false, message: "Too many requests. Please wait and try again." });
        }
        return next();
    };
}

// Browsers send Origin on cross-site writes; reject unexpected origins before a cookie-authenticated action runs.
export function protectUnsafeRequestOrigins(allowedOrigins) {
    return (request, response, next) => {
        if (!unsafeMethods.has(request.method)) return next();

        const source = request.get("origin") ?? request.get("referer");
        if (!source) return next(); // Non-browser clients have no ambient browser cookie context.

        let sourceOrigin;
        try {
            sourceOrigin = new URL(source).origin;
        } catch {
            return response.status(403).json({ success: false, message: "This request origin is not allowed." });
        }

        if (!allowedOrigins.has(sourceOrigin)) {
            return response.status(403).json({ success: false, message: "This request origin is not allowed." });
        }
        return next();
    };
}
