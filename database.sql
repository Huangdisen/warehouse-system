-- =============================================
-- 百越仓库管理系统 - Supabase 数据库初始化脚本
-- =============================================

-- 1. 用户信息表 (扩展 Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.profiles enable row level security;

-- profiles 策略：用户只能读取自己的信息，管理员可以读取所有
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Admin can view all profiles" on public.profiles;
create policy "Admin can view all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 新用户注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  return new;
end;
$$ language plpgsql security definer;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end;
$$;

-- 2. 产品表
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  spec text not null,
  warehouse text not null default 'finished' check (warehouse in ('finished', 'semi')),
  warning_qty integer not null default 10,
  quantity integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.products
  add column if not exists prize_type text;

-- 启用 RLS
alter table public.products enable row level security;

-- products 策略：所有登录用户可读，仅管理员可写
drop policy if exists "Authenticated users can view products" on public.products;
create policy "Authenticated users can view products" on public.products
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin can insert products" on public.products;
create policy "Admin can insert products" on public.products
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admin can update products" on public.products;
create policy "Admin can update products" on public.products
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admin can delete products" on public.products;
create policy "Admin can delete products" on public.products
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 3. 客户表
create table if not exists public.customers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  contact text,
  phone text,
  address text,
  remark text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.customers enable row level security;

-- customers 策略：所有登录用户可读写
drop policy if exists "Authenticated users can view customers" on public.customers;
create policy "Authenticated users can view customers" on public.customers
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert customers" on public.customers;
create policy "Authenticated users can insert customers" on public.customers
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update customers" on public.customers;
create policy "Authenticated users can update customers" on public.customers
  for update using (auth.role() = 'authenticated');

-- 4. 出入库记录表
create table if not exists public.stock_records (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products on delete cascade not null,
  type text not null check (type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  stock_date date not null,
  operator_id uuid references public.profiles not null,
  remark text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.stock_records
  add column if not exists production_date date;

alter table public.stock_records
  add column if not exists customer_id uuid references public.customers on delete set null;

-- 启用 RLS
alter table public.stock_records enable row level security;

-- stock_records 策略：所有登录用户可读可写
drop policy if exists "Authenticated users can view records" on public.stock_records;
create policy "Authenticated users can view records" on public.stock_records
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert records" on public.stock_records;
create policy "Authenticated users can insert records" on public.stock_records
  for insert with check (auth.role() = 'authenticated');

-- 5. 生产记录主表
create table if not exists public.production_records (
  id uuid default gen_random_uuid() primary key,
  production_date date not null,
  warehouse text not null default 'finished' check (warehouse in ('finished', 'semi')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  submitted_by uuid references public.profiles not null,
  confirmed_by uuid references public.profiles,
  confirmed_at timestamp with time zone,
  reject_reason text,
  remark text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.production_records enable row level security;

-- production_records 策略：所有登录用户可读写
drop policy if exists "Authenticated users can view production records" on public.production_records;
create policy "Authenticated users can view production records" on public.production_records
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert production records" on public.production_records;
create policy "Authenticated users can insert production records" on public.production_records
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update production records" on public.production_records;
create policy "Authenticated users can update production records" on public.production_records
  for update using (auth.role() = 'authenticated');

-- 6. 生产记录明细表
create table if not exists public.production_record_items (
  id uuid default gen_random_uuid() primary key,
  record_id uuid references public.production_records on delete cascade not null,
  product_id uuid references public.products on delete restrict not null,
  quantity integer not null check (quantity > 0),
  warehouse text not null check (warehouse in ('finished', 'semi'))
);

-- 启用 RLS
alter table public.production_record_items enable row level security;

-- production_record_items 策略：所有登录用户可读写
drop policy if exists "Authenticated users can view production record items" on public.production_record_items;
create policy "Authenticated users can view production record items" on public.production_record_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert production record items" on public.production_record_items;
create policy "Authenticated users can insert production record items" on public.production_record_items
  for insert with check (auth.role() = 'authenticated');

-- 7. 出入库时自动更新产品库存的函数
create or replace function public.update_product_quantity()
returns trigger as $$
begin
  if new.type = 'in' then
    update public.products
    set quantity = quantity + new.quantity,
        updated_at = now()
    where id = new.product_id;
  elsif new.type = 'out' then
    -- 检查库存是否足够
    if (select quantity from public.products where id = new.product_id) < new.quantity then
      raise exception '库存不足';
    end if;
    update public.products
    set quantity = quantity - new.quantity,
        updated_at = now()
    where id = new.product_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 7.1 半成品转移到成品仓（事务处理）
create or replace function public.transfer_semi_to_finished(
  p_semi_product_id uuid,
  p_finished_product_id uuid,
  p_quantity integer,
  p_stock_date date,
  p_remark text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  semi_product record;
  out_remark text;
  in_remark text;
begin
  if auth.uid() is null then
    raise exception '未登录';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception '数量必须大于0';
  end if;

  select name, spec into semi_product
  from public.products
  where id = p_semi_product_id and warehouse = 'semi';

  if not found then
    raise exception '半成品不存在或仓库类型不正确';
  end if;

  if not exists (
    select 1 from public.products
    where id = p_finished_product_id and warehouse = 'finished'
  ) then
    raise exception '成品不存在或仓库类型不正确';
  end if;

  out_remark := case
    when p_remark is null or btrim(p_remark) = '' then '转移到成品仓'
    else '转移到成品仓 - ' || p_remark
  end;

  in_remark := '从半成品仓转入 - ' || semi_product.name || ' ' || semi_product.spec ||
    case
      when p_remark is null or btrim(p_remark) = '' then ''
      else ' - ' || p_remark
    end;

  insert into public.stock_records (
    product_id,
    type,
    quantity,
    stock_date,
    operator_id,
    remark
  ) values (
    p_semi_product_id,
    'out',
    p_quantity,
    p_stock_date,
    auth.uid(),
    out_remark
  );

  insert into public.stock_records (
    product_id,
    type,
    quantity,
    stock_date,
    operator_id,
    remark
  ) values (
    p_finished_product_id,
    'in',
    p_quantity,
    p_stock_date,
    auth.uid(),
    in_remark
  );
end;
$$;

grant execute on function public.transfer_semi_to_finished(uuid, uuid, integer, date, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_stock_record_created'
  ) then
    create trigger on_stock_record_created
      after insert on public.stock_records
      for each row execute procedure public.update_product_quantity();
  end if;
end;
$$;

-- 8. 创建索引优化查询
create index if not exists idx_products_warehouse on public.products(warehouse);
create index if not exists idx_products_quantity on public.products(quantity);
create index if not exists idx_stock_records_product on public.stock_records(product_id);
create index if not exists idx_stock_records_date on public.stock_records(stock_date);
create index if not exists idx_stock_records_type on public.stock_records(type);
create index if not exists idx_stock_records_customer on public.stock_records(customer_id);
create index if not exists idx_customers_name on public.customers(name);
create index if not exists idx_production_records_status on public.production_records(status);
create index if not exists idx_production_records_created on public.production_records(created_at);
create index if not exists idx_production_items_record on public.production_record_items(record_id);

-- 9. 创建视图：库存预警产品
create or replace view public.low_stock_products
with (security_invoker = true) as
select
  id,
  name,
  spec,
  warehouse,
  quantity,
  warning_qty
from public.products
where quantity <= warning_qty;
