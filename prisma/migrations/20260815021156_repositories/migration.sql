-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "tracked_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- Uniqueness is case-insensitive ("Owner/Repo" and "owner/repo" are the same
-- repository on GitHub), so the index is on lower(full_name). Prisma cannot
-- model functional indexes, which is why this line is written by hand.
CREATE UNIQUE INDEX "repositories_full_name_lower_key"
  ON "repositories" (lower("full_name"));
