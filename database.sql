-- =============================================
-- 仓库管理系统 - Supabase 数据库初始化脚本
-- =============================================

-- 1. 用户信息表 (扩展 Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.profiles enable row level security;

-- profiles 策略：用户只能读取自己的信息，管理员可以读取所有
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. 产品表
create table public.products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  spec text not null,
  warehouse text not null default 'finished' check (warehouse in ('finished', 'semi')),
  warning_qty integer not null default 10,
  quantity integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.products enable row level security;

-- products 策略：所有登录用户可读，仅管理员可写
create policy "Authenticated users can view products" on public.products
  for select using (auth.role() = 'authenticated');

create policy "Admin can insert products" on public.products
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update products" on public.products
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete products" on public.products
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 3. 出入库记录表
create table public.stock_records (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products on delete cascade not null,
  type text not null check (type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  stock_date date not null,
  operator_id uuid references public.profiles not null,
  remark text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.stock_records enable row level security;

-- stock_records 策略：所有登录用户可读可写
create policy "Authenticated users can view records" on public.stock_records
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert records" on public.stock_records
  for insert with check (auth.role() = 'authenticated');

-- 4. 出入库时自动更新产品库存的函数
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

create trigger on_stock_record_created
  after insert on public.stock_records
  for each row execute procedure public.update_product_quantity();

-- 5. 创建索引优化查询
create index idx_products_warehouse on public.products(warehouse);
create index idx_products_quantity on public.products(quantity);
create index idx_stock_records_product on public.stock_records(product_id);
create index idx_stock_records_date on public.stock_records(stock_date);
create index idx_stock_records_type on public.stock_records(type);

-- 6. 创建视图：库存预警产品
create or replace view public.low_stock_products as
select 
  id,
  name,
  spec,
  warehouse,
  quantity,
  warning_qty
from public.products
where quantity <= warning_qty;
