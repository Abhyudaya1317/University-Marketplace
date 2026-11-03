// Check the configured backend port before starting nodemon, so a second dev server fails clearly.
import "dotenv/config";
import net from "node:net";

const port = Number(process.env.PORT || 5000);

// Reject invalid port settings before trying to start the backend.
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("CampusX PORT must be a valid number between 1 and 65535.");
    process.exit(1);
}

// Briefly claim the same IPv4 address that the Express server uses.
const portCheck = net.createServer();

portCheck.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`CampusX backend is already using port ${port}. Keep using that server instead of starting another one.`);
        process.exitCode = 1;
        return;
    }

    console.error(`CampusX could not check port ${port} (${error.code || "UNKNOWN"}).`);
    process.exitCode = 1;
});

portCheck.listen(port, "0.0.0.0", () => {
    // Release the temporary check socket so nodemon can start Express on the same port.
    portCheck.close((error) => {
        if (error) {
            console.error(`CampusX could not release port ${port} after checking it.`);
            process.exitCode = 1;
        }
    });
});
