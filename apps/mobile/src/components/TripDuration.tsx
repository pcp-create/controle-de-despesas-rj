import { useEffect, useState } from "react";

export function formatDuration(start: string, now = Date.now()) {
  const elapsed =
    Math.max(0, Math.floor((now - Date.parse(start)) / 1000)) || 0;
  return [
    Math.floor(elapsed / 3600),
    Math.floor(elapsed / 60) % 60,
    elapsed % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function compactDuration(start: string, end = Date.now()) {
  const seconds =
    Math.max(0, Math.floor((end - Date.parse(start)) / 1000)) || 0;
  return [
    seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : "",
    seconds >= 60 ? `${Math.floor(seconds / 60) % 60}min` : "",
    `${seconds % 60}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function TripDuration({
  start,
  compact = false,
}: {
  start: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <strong
      className={compact ? "trip-duration-compact" : "trip-duration"}
      aria-label="Duração da viagem"
    >
      {compact ? compactDuration(start, now) : formatDuration(start, now)}
    </strong>
  );
}
