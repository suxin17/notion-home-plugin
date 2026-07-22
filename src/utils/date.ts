// 日期工具

const PAD = (n: number) => n.toString().padStart(2, "0");

/** YYYY-MM-DD 格式今天 */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
}

/** 中文友好：今天、明天、昨天、3 天后、下周、N 天前/后 */
export function relativeDate(date: string): string {
  if (!date) return "";
  const target = new Date(date);
  if (isNaN(target.getTime())) return date;

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays === -1) return "昨天";
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} 天后`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} 天前`;
  if (diffDays > 7 && diffDays <= 14) return "下周";
  if (diffDays < -7 && diffDays >= -14) return "上周";
  return date;
}

/** 简单稳定哈希：用于生成 task id */
export function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** 时段问候：早上/下午/晚上 */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  if (h < 22) return "晚上好";
  return "夜深了";
}
