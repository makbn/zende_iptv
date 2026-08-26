"use client";

import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
  /** Minimum column width in px — used to auto-compute column count. */
  columnWidth?: number;
  rowHeight: number;
  gap?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

/** Virtualized responsive poster grid using window scroll. */
export function VirtualChannelGrid<T>({
  items,
  columnWidth = 195,
  rowHeight,
  gap = 12,
  className,
  renderItem,
  getKey,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateCols = () => {
      const width = el.offsetWidth;
      const cols = Math.max(1, Math.floor((width + gap) / (columnWidth + gap)));
      setColumnCount(cols);
    };

    updateCols();

    const observer = new ResizeObserver(updateCols);
    observer.observe(el);
    return () => observer.disconnect();
  }, [columnWidth, gap]);

  const rowCount = Math.ceil(items.length / columnCount);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: useCallback(() => rowHeight + gap, [rowHeight, gap]),
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={containerRef} className={className}>
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
              className="absolute left-0 top-0 grid w-full"
              style={{
                height: `${rowHeight}px`,
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${gap}px`,
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
