-- 1. Ensure product_images table exists (one image per product)
create table if not exists public.product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  image_url text not null,
  created_at timestamp with time zone default now()
);

-- 2. Join table for products and locations (many-to-many)
create table if not exists public.product_locations (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade
);

-- 3. Supabase Storage bucket for product images
-- (Run this in Supabase SQL editor, then create a bucket named 'productimages')

-- 4. RLS policies for public upload/read (if not using Supabase Auth)
-- Allow public read/write for productimages bucket
-- (Run in Supabase SQL editor)
--
-- Storage policies example:
--
-- CREATE POLICY "Public upload for product images" ON storage.objects
--   FOR INSERT TO public
--   USING (bucket_id = 'productimages');
--
-- CREATE POLICY "Public read for product images" ON storage.objects
--   FOR SELECT TO public
--   USING (bucket_id = 'productimages');

-- 5. Ensure products table has correct relationships
alter table public.products
  drop constraint if exists products_category_id_fkey,
  add constraint products_category_id_fkey
    foreign key (category_id) references categories(id) on delete set null;

-- 6. (Optional) Add missing columns to products if needed
alter table public.products
  add column if not exists sku text,
  add column if not exists cost_price numeric,
  add column if not exists standard_price numeric,
  add column if not exists promotional_price numeric,
  add column if not exists promo_start_date date,
  add column if not exists promo_end_date date,
  add column if not exists currency text;
