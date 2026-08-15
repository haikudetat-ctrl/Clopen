"use client";

import { useState } from "react";
import { ShiftNoteFormClient } from "./shift-note-form-client";
import { setShiftNoteActiveForm, setShiftNotePinnedForm } from "./actions";

type ShiftNote = {
  id: string;
  title: string;
  body: string;
  service_date: string;
  shift_type: string | null;
  note_scope: string;
  priority: string;
  is_pinned: boolean;
  is_active: boolean;
  expires_at: string | null;
};

/** Pin/edit/remove controls for a note, shown only to owner_admin or a
 * head_bartender managing a bar/wine/spirits note -- gate is enforced by
 * the caller (page.tsx) not rendering this at all otherwise, and re-checked
 * server-side in actions.ts / RLS regardless. */
export function ShiftNoteAdminControls({
  note,
  role,
}: {
  note: ShiftNote;
  role: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <div className="flex flex-wrap gap-2">
        <form action={setShiftNotePinnedForm}>
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="note_scope" value={note.note_scope} />
          <input
            type="hidden"
            name="is_pinned"
            value={note.is_pinned ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
          >
            {note.is_pinned ? "Unpin" : "Pin"}
          </button>
        </form>

        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
        >
          {editing ? "Cancel edit" : "Edit"}
        </button>

        <form action={setShiftNoteActiveForm}>
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="note_scope" value={note.note_scope} />
          <input
            type="hidden"
            name="is_active"
            value={note.is_active ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
          >
            {note.is_active ? "Remove" : "Restore"}
          </button>
        </form>
      </div>

      {editing && (
        <div className="mt-3">
          <ShiftNoteFormClient
            note={note}
            role={role}
            onSaved={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
