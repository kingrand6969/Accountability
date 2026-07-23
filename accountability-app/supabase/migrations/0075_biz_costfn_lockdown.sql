-- 0075: biz_item_unit_cost is an INTERNAL helper (recursive recipe cost). It has
-- no ownership check, so a member could call it directly with another member's
-- item id and read that item's cost. It is only ever called from the two
-- ownership-checked SECURITY DEFINER wrappers (biz_items_costed / biz_dashboard),
-- which keep working after this revoke because they run as the function owner.
revoke execute on function public.biz_item_unit_cost(uuid, int) from authenticated, anon, public;
