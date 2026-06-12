"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { WebsiteIntakeForm } from "./WebsiteIntakeForm";

/**
 * Collapsed-by-default "regenerate" surface for clients who already have a website: just a button
 * until pressed, then the intake form to submit updated details as a new draft for review.
 */
export function RegenerateSection({
  maxPages,
  canBook,
  canUseForms,
}: {
  maxPages: number;
  canBook: boolean;
  canUseForms: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div>
          <h2 className="font-display text-xl text-stone-900">Want changes to your website?</h2>
          <p className="mt-1 text-sm text-stone-500">
            Submit updated details to create a new draft for review.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Regenerate website</Button>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl text-stone-900">Regenerate your website</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-stone-500 hover:underline">
          Cancel
        </button>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Submit updated details to create a new draft for review.
      </p>
      <div className="mt-6">
        <WebsiteIntakeForm
          submitLabel="Regenerate draft"
          maxPages={maxPages}
          canBook={canBook}
          canUseForms={canUseForms}
        />
      </div>
    </div>
  );
}
