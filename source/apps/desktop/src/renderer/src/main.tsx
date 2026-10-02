import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import { queryClient } from "./lib/query-client";
import "./styles/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("BCIS renderer root was not found.");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

