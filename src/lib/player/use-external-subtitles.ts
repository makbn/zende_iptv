"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ExternalSubtitleTrack = {
  id: string;
  label: string;
  language: string;
  vttUrl: string;
};

type ActiveSource = "builtin" | "external" | "off";

export function useExternalSubtitles(video: HTMLVideoElement | null) {
  const [tracks, setTracks] = useState<ExternalSubtitleTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<ActiveSource>("off");
  const trackElementsRef = useRef<Map<string, HTMLTrackElement>>(new Map());

  const addTrack = useCallback((track: ExternalSubtitleTrack) => {
    setTracks((prev) => {
      if (prev.some((item) => item.id === track.id)) return prev;
      return [...prev, track];
    });
    setActiveTrackId(track.id);
    setActiveSource("external");
  }, []);

  const selectExternalTrack = useCallback((trackId: string | null) => {
    setActiveTrackId(trackId);
    setActiveSource(trackId ? "external" : "off");
  }, []);

  const turnOffExternal = useCallback(() => {
    setActiveTrackId(null);
    if (activeSource === "external") {
      setActiveSource("off");
    }
  }, [activeSource]);

  const clearTracks = useCallback(() => {
    setTracks([]);
    setActiveTrackId(null);
    setActiveSource("off");
  }, []);

  useEffect(() => {
    if (!video) return;

    const elements = trackElementsRef.current;
    const activeIds = new Set(tracks.map((track) => track.id));

    for (const [id, element] of elements) {
      if (!activeIds.has(id)) {
        element.remove();
        elements.delete(id);
      }
    }

    for (const track of tracks) {
      let element = elements.get(track.id);
      if (!element) {
        element = document.createElement("track");
        element.kind = "subtitles";
        element.label = track.label;
        element.srclang = track.language;
        element.src = track.vttUrl;
        element.setAttribute("data-zende-subtitle-id", track.id);
        video.appendChild(element);
        elements.set(track.id, element);
      } else {
        element.label = track.label;
        element.srclang = track.language;
        if (element.src !== track.vttUrl) element.src = track.vttUrl;
      }
    }

    for (const track of tracks) {
      const element = elements.get(track.id);
      if (!element?.track) continue;
      element.track.mode =
        activeSource === "external" && activeTrackId === track.id
          ? "showing"
          : "disabled";
    }

    if (activeSource !== "external") {
      for (const element of elements.values()) {
        if (element.track) element.track.mode = "disabled";
      }
    }
  }, [video, tracks, activeTrackId, activeSource]);

  useEffect(() => {
    return () => {
      for (const element of trackElementsRef.current.values()) {
        element.remove();
      }
      trackElementsRef.current.clear();
    };
  }, [video]);

  return {
    tracks,
    activeTrackId,
    activeSource,
    addTrack,
    selectExternalTrack,
    turnOffExternal,
    clearTracks,
    markBuiltinActive: () => setActiveSource("builtin"),
    markOff: () => {
      setActiveTrackId(null);
      setActiveSource("off");
    },
  };
}
