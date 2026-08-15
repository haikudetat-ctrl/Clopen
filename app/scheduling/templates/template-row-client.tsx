"use client";

import { useState } from "react";
import { TemplateFormClient } from "./template-form-client";
import { RequirementFormClient } from "./requirement-form-client";
import {
  deleteTemplateForm,
  updateRequirementForm,
  removeRequirementForm,
} from "./actions";
import { formatTime } from "@/lib/scheduling";

type Requirement = { id: string; role: string; required_count: number };
type Template = { id: string; name: string; start_time: string; end_time: string };

export function TemplateRowClient({
  template,
  requirements,
}: {
  template: Template;
  requirements: Requirement[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-zinc-900">{template.name}</h3>
          <p className="text-sm text-zinc-500">
            {formatTime(template.start_time)} – {formatTime(template.end_time)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <form action={deleteTemplateForm}>
            <input type="hidden" name="id" value={template.id} />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-300"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {editing && (
        <div className="mt-4">
          <TemplateFormClient
            template={template}
            onSaved={() => setEditing(false)}
          />
        </div>
      )}

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Role requirements
        </h4>
        <div className="mb-3 flex flex-col gap-2">
          {requirements.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-zinc-900">{r.role}</span>
              <form
                action={updateRequirementForm}
                className="flex items-center gap-1"
              >
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="required_count"
                  type="number"
                  min={1}
                  defaultValue={r.required_count}
                  className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
                />
                <button
                  type="submit"
                  className="rounded-full border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
                >
                  Save
                </button>
              </form>
              <form action={removeRequirementForm}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
          {requirements.length === 0 && (
            <p className="text-sm text-zinc-400">No roles required yet.</p>
          )}
        </div>
        <RequirementFormClient templateId={template.id} />
      </div>
    </div>
  );
}
