-- DropIndex
DROP INDEX "nas_craft_steps_product_id_folder_key";

-- DropIndex
DROP INDEX "nas_craft_steps_product_id_order_index_idx";

-- AlterTable
ALTER TABLE "nas_craft_steps" ADD COLUMN     "shoot" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "nas_craft_steps_product_id_shoot_order_index_idx" ON "nas_craft_steps"("product_id", "shoot", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "nas_craft_steps_product_id_shoot_folder_key" ON "nas_craft_steps"("product_id", "shoot", "folder");

