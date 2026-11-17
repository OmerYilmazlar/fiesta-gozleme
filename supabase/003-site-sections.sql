-- Run once after 001-markets.sql. Existing locations and editor accounts are unchanged.
begin;
create table public.site_sections (
  id text primary key check (id in ('header','hero','highlights','menu','sides','instagram','story','markets','gallery','contact','footer')),
  content jsonb not null default '{}' check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.site_sections enable row level security;
revoke all on public.site_sections from anon, authenticated;
grant select on public.site_sections to anon, authenticated;
grant update(content) on public.site_sections to authenticated;
create policy "Read published site content" on public.site_sections for select to anon, authenticated using (true);
create policy "Editors update site content" on public.site_sections for update to authenticated
  using (exists (select 1 from public.market_editors where user_id = (select auth.uid())))
  with check (exists (select 1 from public.market_editors where user_id = (select auth.uid())));
create trigger section_updated before update on public.site_sections for each row execute function public.market_touch_updated_at();
insert into public.site_sections (id) values ('header'),('hero'),('highlights'),('menu'),('sides'),('instagram'),('story'),('markets'),('gallery'),('contact'),('footer');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/webp']);
create policy "Editors upload site images" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and exists (select 1 from public.market_editors where user_id = (select auth.uid())));
-- The public bucket allows image delivery. Editors can inspect uploads but cannot overwrite or delete old images.
create policy "Editors read site image metadata" on storage.objects for select to authenticated
  using (bucket_id = 'site-images' and exists (select 1 from public.market_editors where user_id = (select auth.uid())));
commit;
