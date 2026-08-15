import Link from "next/link";
import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { TemplateFormClient } from "./template-form-client";
import { TemplateRowClient } from "./template-row-client";

type TemplateRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

type RequirementRow = {
  id: string;
  template_id: string;
  role: string;
  required_count: number;
};

export default async function TemplatesPage() {
  const { user, profile, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          Sign in with a restaurant assigned to view shift templates.
        </main>
      </div>
    );
  }

  if (profile?.role !== "owner_admin") {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Shift templates are owner/admin only
          </h1>
        </main>
      </div>
    );
  }

  const { data: templates } = await supabase
    .from("shift_templates")
    .select("id, name, start_time, end_time")
    .eq("restaurant_id", restaurant.id)
    .order("start_time");

  const templateRows: TemplateRow[] = templates ?? [];
  const templateIds = templateRows.map((t) => t.id);

  const { data: requirements } =
    templateIds.length > 0
      ? await supabase
          .from("shift_requirements")
          .select("id, template_id, role, required_count")
          .in("template_id", templateIds)
          .order("role")
      : { data: [] };

  const requirementsByTemplate = new Map<string, RequirementRow[]>();
  for (const r of requirements ?? []) {
    const list = requirementsByTemplate.get(r.template_id) ?? [];
    list.push(r);
    requirementsByTemplate.set(r.template_id, list);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Shift templates
            </h1>
            <p className="text-sm text-zinc-500">
              {restaurant.name} — define the shifts you run and which roles
              each one needs; the schedule builder fills them in day by day.
            </p>
          </div>
          <Link
            href="/scheduling"
            className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            ← Scheduling
          </Link>
        </div>

        <TemplateFormClient />

        <div className="flex flex-col gap-4">
          {templateRows.map((t) => (
            <TemplateRowClient
              key={t.id}
              template={t}
              requirements={requirementsByTemplate.get(t.id) ?? []}
            />
          ))}
          {templateRows.length === 0 && (
            <p className="text-sm text-zinc-400">No shift templates yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
