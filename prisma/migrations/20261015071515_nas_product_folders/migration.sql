/*
  Warnings:

  - You are about to drop the column `folder` on the `nas_products` table. All the data in the column will be lost.
  - You are about to drop the column `path` on the `nas_products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "nas_products" DROP COLUMN "folder",
DROP COLUMN "path",
ADD COLUMN     "folders" TEXT[],
ADD COLUMN     "paths" TEXT[];
