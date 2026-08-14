-- Backfills organization_id for restaurants that pre-date the multi-tenant
-- migration (00004). Without this, an existing restaurant with no
-- organization_id would become inaccessible to owner_admin once a profile
-- is linked to it, since organization_id = current_organization_id()
-- never matches when both sides are null.
insert into organizations (name, slug)
select r.name, lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'))
from restaurants r
where r.organization_id is null;

update restaurants r
set organization_id = o.id
from organizations o
where r.organization_id is null
  and o.slug = lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'));
