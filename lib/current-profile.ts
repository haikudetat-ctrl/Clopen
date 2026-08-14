import { createClient } from "@/lib/supabase/server";

/**
 * Loads the signed-in user's profile along with their restaurant and
 * organization. Every staff-facing page needs restaurant_id to scope its
 * queries, so this is the one place that logic lives.
 */
export async function getCurrentProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, restaurant: null } as const;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id, restaurant_id")
    .eq("id", user.id)
    .single();

  const { data: restaurant } = profile?.restaurant_id
    ? await supabase
        .from("restaurants")
        .select("id, name, location_name, organization_id")
        .eq("id", profile.restaurant_id)
        .single()
    : { data: null };

  return { supabase, user, profile, restaurant } as const;
}
