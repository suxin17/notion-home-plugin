// 多语言问候服务
// 根据时段返回对应语言的问候

export type GreetingLang = "zh" | "en";

const ZH: Record<string, string> = {
  dawn: "夜深了",
  morning: "早上好",
  noon: "中午好",
  afternoon: "下午好",
  evening: "晚上好",
  night: "夜深了",
};

const EN: Record<string, string> = {
  dawn: "It's late",
  morning: "Good morning",
  noon: "Good afternoon",
  noonAlt: "Lunch time",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "It's late",
};

const SUB: Record<GreetingLang, string> = {
  zh: "这里是你的第二大脑。今天想做点什么？",
  en: "This is your second brain. What do you want to do today?",
};

/** 根据当前小时返回时段 key */
function hourBucket(h: number): string {
  if (h < 6) return "dawn";
  if (h < 11) return "morning";
  if (h < 13) return "noon";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

/** 根据当前小时返回主问候 */
export function greeting(lang: GreetingLang = "zh"): string {
  const h = new Date().getHours();
  const bucket = hourBucket(h);
  if (lang === "en") {
    if (bucket === "noon" && Math.random() < 0.3) return EN.noonAlt;
    return EN[bucket] || EN.morning;
  }
  return ZH[bucket] || ZH.morning;
}

/** 副标题 */
export function greetingSub(lang: GreetingLang = "zh"): string {
  return SUB[lang] || SUB.zh;
}
