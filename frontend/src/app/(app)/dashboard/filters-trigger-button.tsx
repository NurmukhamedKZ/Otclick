"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { openFiltersDrawer } from "@/components/filters-drawer";

export default function FiltersTriggerButton({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Button variant="primary" onClick={() => openFiltersDrawer()}>
      {children}
    </Button>
  );
}
