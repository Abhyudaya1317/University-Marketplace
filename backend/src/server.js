// Load the backend environment before making any API or database configuration.
import "dotenv/config";
import app from "./app.js";

// Start the HTTP listener only for local development and non-serverless hosts.
const PORT = process.env.PORT || 5000;

// Bind on IPv4 and IPv6-capable interfaces so local proxies and hosted platforms can reach the API.
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});

// Report safe listener errors, such as a port already being used by another process.
server.on("error", (error) => {
    console.error(`Backend could not listen on port ${PORT} (${error.code ?? "UNKNOWN"}).`);
    process.exitCode = 1;
});
