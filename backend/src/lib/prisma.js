// Load the environment file before creating Prisma's PostgreSQL driver.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

// Fail early with a plain configuration message if the connection string is missing.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Add it to backend/.env.");
}

// Reuse one client and connection pool for the lifetime of this backend process.
const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
