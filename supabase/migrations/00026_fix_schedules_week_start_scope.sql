-- schedules.week_start was UNIQUE(week_start) globally instead of per
-- restaurant -- a real multi-tenant bug that would block ANY second
-- restaurant from ever having a schedule for a week another restaurant in
-- the app already scheduled (i.e. almost every week, since restaurants
-- run on the same calendar weeks). Rescope it correctly to
-- (restaurant_id, week_start).
alter table public.schedules drop constraint schedules_week_start_key;
alter table public.schedules add constraint schedules_restaurant_week_start_key unique (restaurant_id, week_start);
