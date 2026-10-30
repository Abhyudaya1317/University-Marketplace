// Configure Prisma CLI paths and load the local connection string from backend/.env.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Keep schema, migrations, and database connection settings in one place.
export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations"
    },
    datasource: {
        url: env("DATABASE_URL")
    }
});
