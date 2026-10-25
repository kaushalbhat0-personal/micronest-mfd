"use client";

import * as React from "react";
import { Field } from "@/components/ui/controls";
import { MAX_FILE_BYTES, validateFileMeta } from "../validation";

interface ImportPickerProps {
  onFileText: (fileName: string, text: string) => void;
  onFileError: (message: string) => void;
  disabled?: boolean;
}

/** File picker. Reads text locally via the File API — no upload ever occurs. */
export function ImportPicker({ onFileText, onFileError, disabled }: ImportPickerProps) {
  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so the same file can be picked again after edits.
    event.target.value = "";
    if (!file) return;
    const metaError = validateFileMeta(file.name, file.size);
    if (metaError) {
      onFileError(metaError);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      onFileError(
        "This file is larger than 2 MB. Split it into smaller files and upload separately.",
      );
      return;
    }
    try {
      const text = await file.text();
      onFileText(file.name, text);
    } catch {
      onFileError("Could not read this file. Try saving it as CSV and uploading again.");
    }
  }

  return (
    <div id="upload" className="flex flex-col gap-2">
      <Field
        id="fu-file"
        label="Upload CSV"
        hint="Only .csv files up to 2 MB. Everything is processed on this device."
      >
        <input
          id="fu-file"
          type="file"
          accept=".csv"
          onChange={handleChange}
          disabled={disabled}
          className="min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 disabled:opacity-50"
        />
      </Field>
    </div>
  );
}
