/**
 * EstimationHandler: takes one ChatCaptureDto, delegates to the services and returns one
 * TokenEstimateDto whose totalTokens is the single number for the whole prompt.
 * Flow: tokenizer.service (visible tokens) -> estimation.service (hidden tokens) -> sum.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */
export {};
