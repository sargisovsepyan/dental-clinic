import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="site-container py-20">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-6 h-14 max-w-2xl" />
      <Skeleton className="mt-4 h-6 max-w-xl" />
      <div className="mt-16 grid gap-5 md:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
