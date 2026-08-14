import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";

const statusStyles: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-800",
  not_started: "bg-zinc-100 text-zinc-500",
};

const statusLabels: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};

export default async function TrainingPage() {
  const { user, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          {user
            ? "No restaurant assigned yet."
            : "Sign in to view training modules."}
        </main>
      </div>
    );
  }

  const { data: modules } = await supabase
    .from("training_modules")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("sort_order");

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: progress } =
    moduleIds.length > 0
      ? await supabase
          .from("training_progress")
          .select("module_id, status, score")
          .eq("user_id", user.id)
          .in("module_id", moduleIds)
      : { data: [] };

  const progressByModule = new Map(
    (progress ?? []).map((p) => [p.module_id, p])
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          Training
        </h1>

        {(modules?.length ?? 0) === 0 && (
          <p className="text-sm text-zinc-500">No training modules yet.</p>
        )}

        <div className="flex flex-col gap-3">
          {(modules ?? []).map((mod) => {
            const status = progressByModule.get(mod.id)?.status ?? "not_started";
            return (
              <div
                key={mod.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-zinc-900">{mod.title}</h3>
                    {mod.is_required && (
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                        Required
                      </span>
                    )}
                  </div>
                  {mod.description && (
                    <p className="mt-1 text-sm text-zinc-600">
                      {mod.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400">
                    {mod.role_scope !== "all" ? `${mod.role_scope} · ` : ""}
                    {mod.difficulty ? `${mod.difficulty} · ` : ""}
                    {mod.estimated_minutes
                      ? `${mod.estimated_minutes} min`
                      : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    statusStyles[status] ?? statusStyles.not_started
                  }`}
                >
                  {statusLabels[status] ?? status}
                </span>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
