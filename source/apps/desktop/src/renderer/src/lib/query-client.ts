import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 15_000
    },
    mutations: {
      retry: false
    }
  }
});

/** Destroy cached private results and cancel queries before an auth boundary changes. */
export function clearPrivateQueries(): void {
  queryClient.clear();
}

