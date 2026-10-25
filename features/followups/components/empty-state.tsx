interface EmptyStateProps {
  title: string;
  hint?: string;
}

/** Feature-local empty state. No shared system until a second consumer exists. */
export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
      <p className="text-sm font-medium text-stone-800">{title}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
