import { Skeleton } from "@/components/ui/skeleton";

export function TableLoadingState({ label }: { label: string }) {
  return (
    <output className="flex flex-col gap-3 p-5" aria-label={label}>
      {[1, 2, 3, 4].map((row) => (
        <Skeleton key={row} className="h-12 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </output>
  );
}
