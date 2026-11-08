// Configure Express once so both local HTTP and Vercel use the same application.
// Deployment verification marker: this comment intentionally changes no runtime behavior.
// Backend redeployment check: this comment-only marker also has no runtime effect.
// Comment-only marker to verify ahv2 Git deployment after removing build skips.
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { listingUploadDirectory } from "./features/listings/listingPhotoUpload.js";
import { profileUploadDirectory } from "./features/auth/profilePhotoUpload.js";
import authRoutes from "./features/auth/authRoutes.js";
import engagementRoutes from "./features/engagement/engagementRoutes.js";
import reviewRoutes from "./features/engagement/reviewRoutes.js";
import listingsRoutes from "./features/listings/listingsRoutes.js";
import productsRoutes from "./features/listings/productsRoutes.js";
import orderRoutes from "./features/orders/orderRoutes.js";
import messagesRoutes from "./features/messages/messagesRoutes.js";
import sellerRoutes from "./features/sellers/sellerRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";

const app = express();

// Allow the configured Angular origin and local development while keeping browser credentials enabled.
const allowedOrigins = new Set();
for (const value of [process.env.FRONTEND_URL, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:4200"])]) {
    if (!value) continue;
    try {
        allowedOrigins.add(new URL(value).origin);
    } catch {
        throw new Error("FRONTEND_URL must be a valid absolute URL.");
    }
}
app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// Expose uploaded media on persistent local hosts; Vercel deployments require external object storage.
app.use("/api/uploads/listings", express.static(listingUploadDirectory, {
    dotfiles: "deny",
    fallthrough: false,
    setHeaders: (response) => {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "public, max-age=86400");
    }
}));
app.use("/api/uploads/profiles", express.static(profileUploadDirectory, {
    dotfiles: "deny",
    fallthrough: false,
    setHeaders: (response) => {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "public, max-age=86400, immutable");
    }
}));

// Preserve every existing route module and its public API path.
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/listings", reviewRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/listings", engagementRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messagesRoutes);

// Return a safe JSON failure when an unexpected route or middleware error reaches Express.
app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    console.error(`Request failed (${error.code ?? "UNKNOWN"}).`);
    return response.status(500).json({ success: false, message: "The server could not complete the request." });
});

export default app;
