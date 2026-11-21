/**
 * TipsCatalog: static, jargon-free catalog of everyday AI habits that save energy, water, and
 * CO2 without losing answer quality, grouped by category and impact level.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

export type TipCategoryId = 'before-asking' | 'how-to-ask' | 'chat-habits';

export type TipFilterId = 'all' | TipCategoryId;

export type TipImpactLevel = 'high' | 'quick-win';

export type TipId =
  | 'start-fresh-chat'
  | 'match-model-to-task'
  | 'save-deep-thinking'
  | 'ask-for-length-and-format'
  | 'bundle-related-questions'
  | 'skip-thanks-messages'
  | 'share-only-needed-section'
  | 'use-regular-search'
  | 'edit-or-stop-early';

export interface TipExample {
  insteadOf: string;
  tryThis: string;
}

export interface TipItem {
  id: TipId;
  title: string;
  category: TipCategoryId;
  impact: TipImpactLevel;
  summary: string;
  example: TipExample;
}

export interface TipCategoryOption {
  id: TipFilterId;
  label: string;
}

export const TIP_CATEGORIES: readonly TipCategoryOption[] = [
  { id: 'all', label: 'All' },
  { id: 'before-asking', label: 'Before you ask' },
  { id: 'how-to-ask', label: 'How you ask' },
  { id: 'chat-habits', label: 'Chat habits' },
];

export const TIP_CATEGORY_LABELS: Record<TipCategoryId, string> = {
  'before-asking': 'Before you ask',
  'how-to-ask': 'How you ask',
  'chat-habits': 'Chat habits',
};

export const TIP_IMPACT_LABELS: Record<TipImpactLevel, string> = {
  high: 'High impact',
  'quick-win': 'Quick win',
};

/** Curated everyday habits ordered from highest impact to quick wins. */
export const TIPS_CATALOG: readonly TipItem[] = [
  {
    id: 'start-fresh-chat',
    title: 'Start a fresh chat for new topics',
    category: 'chat-habits',
    impact: 'high',
    summary:
      'Every reply re-reads the entire conversation—starting fresh saves energy and gives sharper, less confused answers.',
    example: {
      insteadOf: 'Keeping 40 messages about travel, recipes, and work in one endless thread.',
      tryThis: 'Click "New Chat" whenever you switch to a new topic.',
    },
  },
  {
    id: 'match-model-to-task',
    title: 'Match the AI model to the task',
    category: 'before-asking',
    impact: 'high',
    summary:
      'Heavy flagship models use up to 10× more energy—fast standard models handle everyday writing and summaries just as well.',
    example: {
      insteadOf: 'Using the heaviest model to fix grammar or draft a quick email.',
      tryThis:
        'Use a lighter, faster model for daily tasks and save heavy models for complex work.',
    },
  },
  {
    id: 'save-deep-thinking',
    title: 'Save "Deep Thinking" for hard problems',
    category: 'before-asking',
    impact: 'high',
    summary:
      'Extended reasoning burns extra energy thinking step-by-step before replying—great for tough decisions, wasted on simple lookups.',
    example: {
      insteadOf: 'Leaving deep reasoning turned on for every casual question.',
      tryThis: 'Turn reasoning on only for complex analysis, math, or multi-step planning.',
    },
  },
  {
    id: 'ask-for-length-and-format',
    title: 'Ask for the length and format you want',
    category: 'how-to-ask',
    impact: 'high',
    summary:
      'AI replies use the most energy per word—requesting bullet points or a word limit gives you the same facts without filler.',
    example: {
      insteadOf: '"Explain how solar panels work."',
      tryThis: '"Explain how solar panels work in 5 concise bullet points."',
    },
  },
  {
    id: 'bundle-related-questions',
    title: 'Bundle related questions into one message',
    category: 'how-to-ask',
    impact: 'quick-win',
    summary:
      'Asking two or three related questions together avoids repeating the background setup over multiple back-and-forth turns.',
    example: {
      insteadOf: 'Sending 4 separate short messages one after another.',
      tryThis: 'Send one numbered list with your related questions together.',
    },
  },
  {
    id: 'skip-thanks-messages',
    title: 'Skip "Thanks!"-only follow-up messages',
    category: 'chat-habits',
    impact: 'quick-win',
    summary:
      'Sending just "Thanks!" triggers a full AI run (reloading the entire chat) just to reply "You\'re welcome!"',
    example: {
      insteadOf: 'Sending a final message that only says "Great, thank you!"',
      tryThis: 'Simply close or leave the chat once you have what you need.',
    },
  },
  {
    id: 'share-only-needed-section',
    title: 'Share only the section you need',
    category: 'before-asking',
    impact: 'quick-win',
    summary:
      "Uploading a huge document for one question forces the AI to process pages you don't care about.",
    example: {
      insteadOf: 'Dropping a 50-page PDF to ask about one table on page 4.',
      tryThis: 'Copy-paste the relevant paragraph or upload just the needed pages.',
    },
  },
  {
    id: 'use-regular-search',
    title: 'Use regular search for quick facts',
    category: 'before-asking',
    impact: 'quick-win',
    summary:
      'Checking weather, store hours, or a website link is faster and uses a fraction of the energy in a regular search engine.',
    example: {
      insteadOf: 'Asking an AI chatbot "What time does the pharmacy close today?"',
      tryThis: 'Use normal web search or bookmarks for quick lookups.',
    },
  },
  {
    id: 'edit-or-stop-early',
    title: 'Edit or stop early when AI misunderstands',
    category: 'chat-habits',
    impact: 'quick-win',
    summary:
      'Stopping an off-track reply early and editing your last message keeps the chat clean instead of stacking corrections.',
    example: {
      insteadOf: 'Letting a wrong answer finish and typing 3 follow-up corrections.',
      tryThis: 'Click "Stop" right away and edit your previous message to clarify.',
    },
  },
];

const TIPS_BY_ID = new Map<TipId, TipItem>(TIPS_CATALOG.map((tip) => [tip.id, tip]));

export function getTipById(id: TipId): TipItem {
  const found = TIPS_BY_ID.get(id);
  if (!found) {
    throw new Error(`Unknown tip id: ${id}`);
  }
  return found;
}

export function isTipId(value: unknown): value is TipId {
  return typeof value === 'string' && TIPS_BY_ID.has(value as TipId);
}
