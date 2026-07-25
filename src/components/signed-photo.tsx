import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";

import { signPhotos } from "@/lib/photos.functions";
import { cn } from "@/lib/utils";

/** Renders a private storage object through a short-lived signed URL. */
export function SignedPhoto({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["signed-photo", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const result = await signPhotos({ data: { paths: [path!] } });
      return result.urls[path!] ?? null;
    },
  });

  if (!path) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }

  if (!data) {
    return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
  }

  return <img src={data} alt={alt} loading="lazy" className={cn("rounded-md object-cover", className)} />;
}
