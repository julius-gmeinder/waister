/**
 * Heuristic Claude tokenizer. Anthropic publishes no vocabulary. Calibrated to ~3.7 chars/token on
 * English, a bit denser than OpenAI's `o200k_base`: Claude splits words > 5 characters slightly
 * more often. Parameters: `config.json` → `tokenizer.anthropic`.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

import { tokenizer } from '../../config/config.json';
import { createHeuristicTokenizer } from './heuristic.tokenizer';

export const countAnthropicTextTokens = createHeuristicTokenizer(tokenizer.anthropic);
