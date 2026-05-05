#!/usr/bin/env node
/**
 * Reset bootstrap administrator username & password (SQLite via Prisma).
 *
 * Usage inside Docker:
 *   docker compose exec zende node scripts/reset-bootstrap-admin.cjs --username admin --password 'new-secret'
 *
 * Requires DATABASE_URL (set in container). Clears refresh tokens for that user.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let username = "admin";
  let password = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--username" && args[i + 1]) {
      username = args[++i];
      continue;
    }
    if (args[i] === "--password" && args[i + 1]) {
      password = args[++i];
      continue;
    }
  }

  if (!password || password.length < 8) {
    console.error(
      "Usage: node scripts/reset-bootstrap-admin.cjs --username NAME --password PASSWORD\nPassword must be at least 8 characters.",
    );
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { isBootstrapAdmin: true },
  });

  if (!admin) {
    console.error("No bootstrap administrator found in the database.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: admin.id },
    data: { username, passwordHash },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

  console.log(
    "Bootstrap administrator updated. All sessions for that account were cleared.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
