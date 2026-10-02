import { describe, expect, it } from "vitest";

import { clearPrivateQueries, queryClient } from "./query-client.js";

describe("private query isolation", () => {
  it("removes the previous account's cached result and in-flight query", async () => {
    queryClient.setQueryData(["subscribers", "owner"], { privateName: "Owner only" });
    const request = queryClient.fetchQuery({ queryKey: ["reports", "owner"], queryFn: () => new Promise<string>(() => undefined) });
    clearPrivateQueries();
    expect(queryClient.getQueryData(["subscribers", "owner"])).toBeUndefined();
    expect(queryClient.getQueryData(["reports", "owner"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    await expect(request).rejects.toBeDefined();
  });
});
