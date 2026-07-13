export type QuoteLanguageMode = 'auto' | 'zh-CN' | 'en-US'

export const QUOTE_LANGUAGE_STORAGE_KEY = 'quote_language'
export const QUOTE_LANGUAGE_CHANGED_EVENT = 'quote-language-changed'

export const englishQuotes = [
  'Hardware is hard.',
  "Magic Smoke is essential. Don't let it out.",
  'Trust logic, but verify voltages.',
  '0.1μF capacitors solve 90% of problems.',
  'It works on my bench.',
  'Electrons flow from negative to positive.',
  'Have you tried turning it off and on again?',
  'Everything is a smoke machine if you operate it wrong.',
  'Measure twice, cut once.',
  'Keep calm and check your ground connections.',
  'Talk is cheap. Show me the code.',
  'There is no place like 127.0.0.1',
  'It works on my machine.',
  "It's not a bug, it's a feature.",
  'Code never lies, comments sometimes do.',
  'Premature optimization is the root of all evil.',
  'Simplicity is the ultimate sophistication.',
  'Log it before you crash it.',
  'Git happens.',
  'sudo make me a sandwich.',
  "Don't Panic.",
  'The spice must flow.',
  "I'm sorry, Dave. I'm afraid I can't do that.",
  'Hello, World.',
  'Do, or do not. There is no try.',
  'Resistance is futile.',
  'Winter is coming.',
  'Stay hungry, stay foolish.',
  'May the Force be with you.',
  'Reality is broken.'
]

export const chineseQuotes = [
  '微光成炬，细流成海。',
  '器有尽，而思无涯。',
  '一线一世界，一芯一乾坤。',
  '静听电流，细看星河。',
  '方寸之间，自有天地。',
  '万物有序，山海可期。',
  '把复杂留给时间。',
  '循迹而行，终见微光。',
  '风来有信，花开有期。',
  '云深不知处，灯火正可亲。',
  '长夜未央，微光不息。',
  '山水有路，归期有时。',
  '向内求静，向外求真。',
  '心中有尺，手上有度。',
  '慢工不迟，静水流深。',
  '一念专注，万事可成。',
  '于无声处，听见回响。',
  '星光不问赶路人。',
  '风过留痕，事过留心。',
  '所行皆有迹，所思皆有光。',
  '小处着手，深处生根。',
  '知其然，也问所以然。',
  '灯亮之前，先把路走完。',
  '山高有径，海阔有舟。',
  '心有定处，步履自稳。',
  '一寸匠心，一程山海。',
  '不慌不忙，来日方长。',
  '让答案在耐心里生长。',
  '万千线路，终归一念。',
  '此刻专注，便是远方。'
]

export function isQuoteLanguageMode(value: unknown): value is QuoteLanguageMode {
  return value === 'auto' || value === 'zh-CN' || value === 'en-US'
}

export function getQuoteCollection(mode: QuoteLanguageMode, locale: string): string[] {
  const resolvedLanguage = mode === 'auto' ? locale : mode
  return resolvedLanguage === 'zh-CN' ? chineseQuotes : englishQuotes
}
