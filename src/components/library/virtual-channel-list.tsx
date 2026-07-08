"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type VirtualListProps<T> = {
  items: T[];
  estimateSize?: number;
  gap?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Vertical virtual list for compact channel rows. */
export function VirtualChannelList<T>({
  items,
  estimateSize = 88,
  gap = 10,
  className,
  renderItem,
  getKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan: 8,
  });

  return (
    <div ref={parentRef} className={cn("max-h-[min(70vh,720px)] overflow-y-auto", className)}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          return (
            <div
              key={getKey(item, row.index)}
              className="absolute left-0 top-0 w-full"
              style={{
                height: `${estimateSize}px`,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {renderItem(item, row.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type VirtualGridProps<T> = {
  items: T[];
  columnCount: number;
  rowHeight: number;
  gap?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Virtualized poster/compact grid (fixed row height). */
export function VirtualChannelGrid<T>({
  items,
  columnCount,
  rowHeight,
  gap = 12,
  className,
  renderItem,
  getKey,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(items.length / columnCount);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan: 3,
  });

  return (
    <div ref={parentRef} className={cn("max-h-[min(75vh,800px)] overflow-y-auto", className)}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const startIndex = row.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);
          return (
            <div
              key={`row-${row.index}`}
              className="absolute left-0 top-0 grid w-full gap-3"
              style={{
                height: `${rowHeight}px`,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item, col) =>
                renderItem(item, startIndex + col),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
