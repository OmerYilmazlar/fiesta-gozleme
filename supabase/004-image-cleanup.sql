-- Run once. Permit approved editors to remove ONLY unreferenced uploaded images.
-- Does not touch image files hosted on GitHub or currently referenced by a section.
begin;
create policy "Editors delete unused site images" on storage.objects
for delete to authenticated
using (
  bucket_id = 'site-images'
  and exists (select 1 from public.market_editors where user_id = (select auth.uid()))
  and not exists (
    select 1 from public.site_sections s,
      lateral jsonb_each_text(s.content) as field(key, value)
    where field.value = 'https://hcdbvsgjuzcwlnwpgvxc.supabase.co/storage/v1/object/public/site-images/' || storage.objects.name
  )
);
commit;
