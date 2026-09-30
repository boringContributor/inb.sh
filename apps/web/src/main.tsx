import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toast } from "@heroui/react";
import { queryClient } from "./lib/queries.ts";
import { router } from "./router.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toast.Provider placement="bottom" />
    </QueryClientProvider>
  </StrictMode>,
);
