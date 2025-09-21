import en from './en.json';
import de from './de.json';

export type Lang = 'en' | 'de';
type Dict = typeof en;
const dicts: Record<Lang, Dict> = { en, de };

export function t(key: string, lang: Lang = 'en'){
  const parts = key.split('.');
  let cur: any = dicts[lang] as any;
  for(const p of parts){ cur = cur?.[p]; if(cur == null) return key; }
  return String(cur);
}
