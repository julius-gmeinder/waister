/**
 * Heuristic tokenizer approximating tiktoken's `o200k_base` (~4.0 chars/token on English prose).
 * Numbers split into 1-3 digit chunks like `o200k_base`. Short words are 1 token, longer ones
 * split into ~4.2-char subwords. Parameters: `config.json` → `tokenizer.openai`.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

import { tokenizer } from '../../config/config.json';
import { createHeuristicTokenizer } from './heuristic.tokenizer';

export const countOpenAiTextTokens = createHeuristicTokenizer(tokenizer.openai);
