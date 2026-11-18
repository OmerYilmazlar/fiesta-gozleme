-- Extend the existing section allowlist; existing content and RLS policies stay intact.
begin;
alter table public.site_sections drop constraint if exists site_sections_id_check;
alter table public.site_sections add constraint site_sections_id_check check (id in ('header','hero','highlights','menu','sides','giftcards','instagram','story','markets','gallery','contact','footer'));
insert into public.site_sections (id) values ('giftcards') on conflict (id) do nothing;
commit;
