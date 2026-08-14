// A deterministic, dependency-free token estimator.
//
// contextpack needs to reason about "how many tokens does this file cost"
// without shelling out to a model-specific tokenizer (which would pull in a
// dependency and tie the whole budget algorithm to one vendor's encoding).
// The chars/4 heuristic is a well-known rough approximation for English text
// and common source code across most BPE tokenizers. It is intentionally
// approximate: what matters for this library is that it is pure, stable
// across runs, and good enough to make consistent allocate/truncate
// decisions - not that it matches any particular model exactly.
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens a string of text would cost.
 * @param {string} text
 * @returns {number} non-negative integer token estimate
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
