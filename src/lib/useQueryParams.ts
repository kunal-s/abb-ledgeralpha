import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Filter state kept in the URL, so a filtered view can be linked and survives reload. */
export function useQueryParams(): [URLSearchParams, (patch: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === "" || v === "all") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: opts?.replace ?? true }
      );
    },
    [setParams]
  );
  return [params, update];
}
