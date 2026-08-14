-- Removes leftover lead-gen tables (campaigns/leads/lead_reviews) that are
-- unrelated to Clopen and were left with RLS disabled, fully exposed to the
-- anon/authenticated Supabase client roles.
drop table if exists lead_reviews;
drop table if exists leads;
drop table if exists campaigns;
