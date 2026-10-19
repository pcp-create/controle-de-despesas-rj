import { Capacitor, registerPlugin } from "@capacitor/core";
const native = registerPlugin<{
  update(options: { start: number }): Promise<{ enabled: boolean }>;
}>("TripNotification");
export async function updateTripNotification(start?: string) {
  if (Capacitor.getPlatform() !== "android") return true;
  const result = await native.update({ start: start ? Date.parse(start) : 0 });
  return result.enabled;
}
