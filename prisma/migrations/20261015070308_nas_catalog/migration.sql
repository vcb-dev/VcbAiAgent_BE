-- CreateEnum
CREATE TYPE "NasSyncStatus" AS ENUM ('running', 'success', 'failed');

-- CreateTable
CREATE TABLE "nas_categories" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nas_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "nas_products" (
    "id" BIGSERIAL NOT NULL,
    "category_code" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "craft_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nas_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nas_craft_steps" (
    "id" BIGSERIAL NOT NULL,
    "product_id" BIGINT NOT NULL,
    "order_index" INTEGER,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "step" TEXT,
    "clips" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nas_craft_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nas_huyk_actions" (
    "id" BIGSERIAL NOT NULL,
    "order_index" INTEGER,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "step" TEXT,
    "clips" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nas_huyk_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nas_sync_runs" (
    "id" BIGSERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "NasSyncStatus" NOT NULL DEFAULT 'running',
    "items" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "nas_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nas_products_sku_idx" ON "nas_products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "nas_products_category_code_sku_key" ON "nas_products"("category_code", "sku");

-- CreateIndex
CREATE INDEX "nas_craft_steps_product_id_order_index_idx" ON "nas_craft_steps"("product_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "nas_craft_steps_product_id_folder_key" ON "nas_craft_steps"("product_id", "folder");

-- CreateIndex
CREATE UNIQUE INDEX "nas_huyk_actions_folder_key" ON "nas_huyk_actions"("folder");

-- CreateIndex
CREATE INDEX "nas_sync_runs_scope_started_at_idx" ON "nas_sync_runs"("scope", "started_at");

-- AddForeignKey
ALTER TABLE "nas_products" ADD CONSTRAINT "nas_products_category_code_fkey" FOREIGN KEY ("category_code") REFERENCES "nas_categories"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nas_craft_steps" ADD CONSTRAINT "nas_craft_steps_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "nas_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
