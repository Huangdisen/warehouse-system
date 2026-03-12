-- 纸箱删除时级联删除关联记录
-- 在 Supabase SQL Editor 中执行此文件
-- 解决：delete on table "cartons" violates foreign key constraint "carton_records_carton_id_fkey"

-- 1. carton_records: 删除纸箱时自动删除其出入库记录
ALTER TABLE public.carton_records
  DROP CONSTRAINT IF EXISTS carton_records_carton_id_fkey;

ALTER TABLE public.carton_records
  ADD CONSTRAINT carton_records_carton_id_fkey
    FOREIGN KEY (carton_id) REFERENCES public.cartons(id) ON DELETE CASCADE;

-- 2. product_carton: 删除纸箱时自动解除产品关联（若存在该表）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_carton'
  ) THEN
    ALTER TABLE public.product_carton
      DROP CONSTRAINT IF EXISTS product_carton_carton_id_fkey;

    ALTER TABLE public.product_carton
      ADD CONSTRAINT product_carton_carton_id_fkey
        FOREIGN KEY (carton_id) REFERENCES public.cartons(id) ON DELETE CASCADE;
  END IF;
END $$;
