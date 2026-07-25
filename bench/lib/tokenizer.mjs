// The single token-counting path for the whole bench. The previous bench used
// `chars / 4`, which misestimates markdown badly; every published number now
// goes through a real BPE tokenizer.
import { encode } from 'gpt-tokenizer';

/**
 * @param {string} text
 * @returns {number} exact BPE token count
 */
export function countTokens(text) {
  if (!text) return 0;
  return encode(text).length;
}
