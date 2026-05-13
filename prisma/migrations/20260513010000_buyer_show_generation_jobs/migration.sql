CREATE TABLE "buyer_show_generation_jobs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_snapshot" JSONB NOT NULL,
  "history_id" TEXT,
  "request" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "product_info" JSONB,
  "results" JSONB,
  "error" TEXT,
  "history_error" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buyer_show_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buyer_show_generation_jobs_user_id_created_at_idx"
  ON "buyer_show_generation_jobs"("user_id", "created_at" DESC);

CREATE INDEX "buyer_show_generation_jobs_status_idx"
  ON "buyer_show_generation_jobs"("status");
