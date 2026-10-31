import type { QueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../api/client";

export function clearAuthClientState(queryClient: QueryClient): void {
  setAccessToken(null);
  queryClient.clear();
}
