import { Nav } from "@/components/nav";
import { getCurrentProfile } from "@/lib/current-profile";
import { AcknowledgeButton } from "@/components/acknowledge-button";

const priorityStyles: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-800",
  normal: "bg-zinc-100 text-zinc-600",
  low: "bg-zinc-100 text-zinc-500",
};

export default async function ShiftNotesPage() {
  const { user, restaurant, supabase } = await getCurrentProfile();

  if (!user || !restaurant) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-zinc-500">
          {user
            ? "No restaurant assigned yet."
            : "Sign in to view shift notes."}
        </main>
      </div>
    );
  }

  const { data: notes } = await supabase
    .from("shift_notes")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("service_date", { ascending: false });

  const noteIds = (notes ?? []).map((n) => n.id);
  const { data: acknowledgements } =
    noteIds.length > 0
      ? await supabase
          .from("shift_note_acknowledgements")
          .select("shift_note_id")
          .eq("user_id", user.id)
          .in("shift_note_id", noteIds)
      : { data: [] };

  const acknowledgedIds = new Set(
    (acknowledgements ?? []).map((a) => a.shift_note_id)
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
          Shift Notes
        </h1>

        {(notes?.length ?? 0) === 0 && (
          <p className="text-sm text-zinc-500">
            No active shift notes right now.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {(notes ?? []).map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {note.is_pinned && (
                    <span className="text-amber-500" title="Pinned">
                      📌
                    </span>
                  )}
                  <h3 className="font-medium text-zinc-900">{note.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      priorityStyles[note.priority] ?? priorityStyles.normal
                    }`}
                  >
                    {note.priority}
                  </span>
                </div>
                <AcknowledgeButton
                  shiftNoteId={note.id}
                  initiallyAcknowledged={acknowledgedIds.has(note.id)}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-600">{note.body}</p>
              <p className="mt-2 text-xs text-zinc-400">
                {note.service_date}
                {note.shift_type ? ` · ${note.shift_type}` : ""}
                {note.note_scope !== "general" ? ` · ${note.note_scope}` : ""}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
