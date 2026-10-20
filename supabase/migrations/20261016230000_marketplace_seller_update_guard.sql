-- Sellers can mark a published listing as sold, but cannot rewrite listing details
-- after publication. New listing edits are not currently supported by the UI.
begin;

drop policy if exists campus_marketplace_update_own_same_campus on public.campus_marketplace_listings;
drop policy if exists campus_marketplace_mark_own_listing_sold on public.campus_marketplace_listings;
create policy campus_marketplace_mark_own_listing_sold on public.campus_marketplace_listings
for update to authenticated
using (
  seller_id = (select auth.uid())
  and university_id = (select private.current_campus_university_id())
  and status = 'published'
)
with check (
  private.current_campus_account_status() = any (array['pending','verified'])
  and seller_id = (select auth.uid())
  and university_id = (select private.current_campus_university_id())
  and status = 'sold'
);

revoke update (category, title, description, price_ngn, contact_instructions)
  on public.campus_marketplace_listings from authenticated;
grant update (status, updated_at)
  on public.campus_marketplace_listings to authenticated;

commit;
