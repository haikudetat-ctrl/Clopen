"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function AcknowledgeButton({
  shiftNoteId,
  initiallyAcknowledged,
}: {
  shiftNoteId: string;
  initiallyAcknowledged: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(initiallyAcknowledged);
  const [isPending, startTransition] = useTransition();

  if (acknowledged) {
    return (
      <span className="text-xs font-medium text-emerald-600">
        Acknowledged
      </span>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("shift_note_acknowledgements")
        .insert({ shift_note_id: shiftNoteId, user_id: user.id });

      if (!error) setAcknowledged(true);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
    >
      {isPending ? "Saving..." : "Acknowledge"}
    </button>
  );
}
