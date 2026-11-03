"use client";

import { useRef, useState } from "react";
import type { ReactNode, Touch } from "react";

type MobilePinchZoomProps = {
  children: ReactNode;
  className?: string;
};

type Point = {
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDistance(first: Touch, second: Touch) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function getMidpoint(first: Touch, second: Touch): Point {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

export function MobilePinchZoom({ children, className = "" }: MobilePinchZoomProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const gestureRef = useRef<{
    distance: number;
    midpoint: Point;
    offset: Point;
    scale: number;
  } | null>(null);
  const panRef = useRef<{
    offset: Point;
    point: Point;
  } | null>(null);

  function resetIfNeeded(nextScale: number, nextOffset: Point) {
    if (nextScale <= MIN_SCALE) {
      setScale(MIN_SCALE);
      setOffset({ x: 0, y: 0 });
      return;
    }

    setScale(nextScale);
    setOffset(nextOffset);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (window.matchMedia("(min-width: 768px)").matches) return;

    if (event.touches.length === 2) {
      const [first, second] = [event.touches[0], event.touches[1]];
      gestureRef.current = {
        distance: getDistance(first, second),
        midpoint: getMidpoint(first, second),
        offset,
        scale,
      };
      panRef.current = null;
      return;
    }

    if (event.touches.length === 1 && scale > MIN_SCALE) {
      panRef.current = {
        offset,
        point: {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        },
      };
    }
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (window.matchMedia("(min-width: 768px)").matches) return;

    if (event.touches.length === 2 && gestureRef.current) {
      event.preventDefault();
      const [first, second] = [event.touches[0], event.touches[1]];
      const nextDistance = getDistance(first, second);
      const nextMidpoint = getMidpoint(first, second);
      const nextScale = clamp(
        (nextDistance / gestureRef.current.distance) * gestureRef.current.scale,
        MIN_SCALE,
        MAX_SCALE,
      );
      const scaleRatio = nextScale / gestureRef.current.scale;
      const viewportRect = viewportRef.current?.getBoundingClientRect();
      const originX = gestureRef.current.midpoint.x - (viewportRect?.left ?? 0);
      const originY = gestureRef.current.midpoint.y - (viewportRect?.top ?? 0);
      const movedX = nextMidpoint.x - gestureRef.current.midpoint.x;
      const movedY = nextMidpoint.y - gestureRef.current.midpoint.y;

      resetIfNeeded(nextScale, {
        x: originX - (originX - gestureRef.current.offset.x) * scaleRatio + movedX,
        y: originY - (originY - gestureRef.current.offset.y) * scaleRatio + movedY,
      });
      return;
    }

    if (event.touches.length === 1 && panRef.current && scale > MIN_SCALE) {
      event.preventDefault();
      setOffset({
        x: panRef.current.offset.x + event.touches[0].clientX - panRef.current.point.x,
        y: panRef.current.offset.y + event.touches[0].clientY - panRef.current.point.y,
      });
    }
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      gestureRef.current = null;
    }
    if (event.touches.length === 0) {
      panRef.current = null;
    }
  }

  function handleDoubleClick() {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    resetIfNeeded(scale > MIN_SCALE ? MIN_SCALE : 2, { x: 0, y: 0 });
  }

  return (
    <div
      ref={viewportRef}
      className={`mobile-pinch-zoom-viewport ${className}`}
      onDoubleClick={handleDoubleClick}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
    >
      <div
        className="mobile-pinch-zoom-content"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
