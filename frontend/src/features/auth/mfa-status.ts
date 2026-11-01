import { useQuery } from "@tanstack/react-query";

import { mfaApi } from "./mfa-api";

export const statusKey = ["auth", "mfa", "status"] as const;

export function useMfaStatus() {
  return useQuery({ queryKey: statusKey, queryFn: mfaApi.status });
}
