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
    <div
      ref={parentRef}
      data-tv-layout="vertical"
      className={cn("max-h-[min(70vh,720px)] overflow-y-auto p-2", className)}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          return (
            <div
              key={getKey(item, row.index)}
              data-tv-index={row.index}
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
  /** Poster height divided by width. Used to keep virtual rows from overlapping. */
  itemAspectRatio?: number;
  /** Fixed card chrome below/around the poster, in px. */
  itemChromeHeight?: number;
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
  itemAspectRatio,
  itemChromeHeight = 0,
  rowHeight,
  gap = 12,
  className,
  renderItem,
  getKey,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateCols = () => {
      const width = el.offsetWidth;
      const cols = Math.max(1, Math.floor((width + gap) / (columnWidth + gap)));
      setContainerWidth(width);
      setColumnCount(cols);
      setScrollMargin(el.offsetTop);
    };

    updateCols();

    const observer = new ResizeObserver(updateCols);
    observer.observe(el);
    return () => observer.disconnect();
  }, [columnWidth, gap]);

  const rowCount = Math.ceil(items.length / columnCount);
  const cellWidth =
    containerWidth > 0
      ? (containerWidth - gap * Math.max(0, columnCount - 1)) / columnCount
      : columnWidth;
  const effectiveRowHeight = itemAspectRatio
    ? Math.max(rowHeight, Math.ceil(cellWidth * itemAspectRatio + itemChromeHeight))
    : rowHeight;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: useCallback(
      () => effectiveRowHeight + gap,
      [effectiveRowHeight, gap],
    ),
    overscan: 3,
    scrollMargin,
  });

  return (
    <div
      ref={containerRef}
      data-tv-layout="grid"
      data-tv-columns={columnCount}
      className={cn("p-2", className)}
    >
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
                height: `${effectiveRowHeight}px`,
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, col) => (
                <div
                  key={getKey(item, startIndex + col)}
                  data-tv-index={startIndex + col}
                  className="h-full min-w-0"
                >
                  {renderItem(item, startIndex + col)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
