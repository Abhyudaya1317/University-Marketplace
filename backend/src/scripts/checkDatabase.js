// Load environment variables before importing the Prisma client.
import "dotenv/config";
import { prisma } from "../lib/prisma.js";

// Run a harmless read-only query to check that PostgreSQL accepts a connection.
async function checkDatabaseConnection() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log("Database connection successful.");
    } catch {
        // Keep credentials and internal connection details out of terminal output.
        console.error("Database connection failed. Check that PostgreSQL is running and backend/.env is correct.");
        process.exitCode = 1;
    } finally {
        // Close Prisma's pool so this short-lived check can exit cleanly.
        await prisma.$disconnect();
    }
}

// Run the check when invoked with `npm run db:check`.
await checkDatabaseConnection();
