CREATE TABLE "buyer_show_histories" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_snapshot" JSONB NOT NULL,
  "title" TEXT NOT NULL,
  "product_name" TEXT,
  "category" TEXT,
  "product_info" JSONB NOT NULL,
  "generation_sets" JSONB NOT NULL,
  "results" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'checking',
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buyer_show_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buyer_show_histories_user_id_created_at_idx"
  ON "buyer_show_histories"("user_id", "created_at" DESC);

CREATE INDEX "buyer_show_histories_expires_at_idx"
  ON "buyer_show_histories"("expires_at");

CREATE INDEX "buyer_show_histories_deleted_at_idx"
  ON "buyer_show_histories"("deleted_at");
