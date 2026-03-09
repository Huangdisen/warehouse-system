-- 物料仓：玻璃瓶、胶瓶、盖子库存管理
-- 在 Supabase SQL Editor 中执行此文件

-- 物料表
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('glass_bottle', 'plastic_bottle', 'cap')),
  spec TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  warning_qty INTEGER NOT NULL DEFAULT 100,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 物料出入库记录表
CREATE TABLE IF NOT EXISTS material_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  stock_date DATE NOT NULL DEFAULT CURRENT_DATE,
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'auto')),
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_material_records_material_id ON material_records(material_id);
CREATE INDEX IF NOT EXISTS idx_material_records_created_at ON material_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_records_stock_date ON material_records(stock_date DESC);

-- RLS 策略
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_records ENABLE ROW LEVEL SECURITY;

-- materials: 所有已认证用户可读，admin 可写
CREATE POLICY "authenticated users can read materials"
  ON materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin can insert materials"
  ON materials FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin can update materials"
  ON materials FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin can delete materials"
  ON materials FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- material_records: 所有已认证用户可读写
CREATE POLICY "authenticated users can read material_records"
  ON material_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can insert material_records"
  ON material_records FOR INSERT
  TO authenticated
  WITH CHECK (true);
