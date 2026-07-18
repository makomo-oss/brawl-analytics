import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBattleTime(timeStr: string) {
  if (!timeStr) return "";
  try {
    // BrawlAPI time format: "20240101T000000.000Z" -> "2024-01-01T00:00:00.000Z"
    if (timeStr.length > 10 && timeStr.indexOf('-') === -1) {
      const year = timeStr.slice(0, 4);
      const month = timeStr.slice(4, 6);
      const day = timeStr.slice(6, 8);
      const time = timeStr.slice(9);
      timeStr = `${year}-${month}-${day}T${time}`;
    }
    
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const MathFloor = Math.floor;
    const diffMins = MathFloor(diffMs / (1000 * 60));
    
    if (diffMins < 0) return "たった今";
    if (diffMins < 60) return `${diffMins}分前`;
    
    const diffHours = MathFloor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    
    const diffDays = MathFloor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}日前`;
    
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  } catch (e) {
    return timeStr;
  }
}
