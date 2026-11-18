-- Uses the existing approved-editor RLS and session checks.
begin;
alter table public.site_sections drop constraint if exists site_sections_id_check;
alter table public.site_sections add constraint site_sections_id_check check (id in ('header','hero','highlights','menu','sides','giftcards','instagram','story','markets','gallery','contact','footer','layout'));
alter table public.site_sections drop constraint if exists site_sections_layout_check;
alter table public.site_sections add constraint site_sections_layout_check check (
 id <> 'layout' or case when jsonb_typeof(content->'order') = 'array' then
 content = jsonb_build_object('order',content->'order')
 and jsonb_array_length(content->'order') = 7
 and content->'order' @> '["menu","markets","giftcards","story","instagram","gallery","contact"]'::jsonb
 else false end
);
insert into public.site_sections(id,content) values ('layout','{"order":["menu","markets","giftcards","story","instagram","gallery","contact"]}'::jsonb) on conflict(id) do nothing;
commit;
