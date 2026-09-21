export const parseSaveStringToArray = (saveString: string): number[] => {
  if (typeof saveString !== "string" || !saveString.trim()) return [];
  return saveString.split("/").map((part) => {
    const num = Number.parseInt(part.trim(), 10);
    return Number.isFinite(num) ? num : 0;
  });
};
