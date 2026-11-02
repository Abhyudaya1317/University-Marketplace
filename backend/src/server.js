// Load the backend environment before making any API or database configuration.
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

// Create one Express app and keep its local port configurable.
const app = express();
const PORT = process.env.PORT || 5000;

// Parse browser cookies and JSON bodies before route handlers read them.
app.use(cors());
app.use(cookieParser());
app.use(express.json());

// Expose only uploaded listing photos and prevent browsers from treating them as scripts.
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

// Keep health, account, seller listings, and public product routes in feature modules.
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/listings", reviewRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/listings", engagementRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messagesRoutes);

// Bind on IPv4 and IPv6-capable interfaces so local proxies and hosted platforms can reach the API.
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});

// Report safe listener errors, such as a port already being used by another process.
server.on("error", (error) => {
    console.error(`Backend could not listen on port ${PORT} (${error.code ?? "UNKNOWN"}).`);
    process.exitCode = 1;
});
