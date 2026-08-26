import { Suspense } from "react";

import { BoardView } from "@/components/board/board-view";

const shell = (
  <div className="fixed inset-0 animate-pulse bg-background" aria-hidden />
);

export default function BoardPage() {
  return (
    <Suspense fallback={shell}>
      <BoardView />
    </Suspense>
  );
}
