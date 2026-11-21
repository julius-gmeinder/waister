/**
 * Heuristic Gemini tokenizer, approximating its SentencePiece unigram model (256k vocab,
 * ~4.1 chars/token on prose). The large vocab keeps words up to ~7 chars as a single piece.
 * Parameters: `config.json` → `tokenizer.google`.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

import { tokenizer } from '../../config/config.json';
import { createHeuristicTokenizer } from './heuristic.tokenizer';

export const countGoogleTextTokens = createHeuristicTokenizer(tokenizer.google);
