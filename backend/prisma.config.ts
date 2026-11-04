// Configure Prisma CLI paths and load local connection settings from backend/.env.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prefer the provider's direct connection for migrations; fall back to the
// application's DATABASE_URL so existing local setups continue to work.
const migrationDatabaseUrl =
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    env("DATABASE_URL");

// Keep schema, migrations, and database connection settings in one place.
export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations"
    },
    datasource: {
        url: migrationDatabaseUrl
    }
});
