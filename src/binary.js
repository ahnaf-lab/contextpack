// Binary-content detection.
//
// contextpack only ever receives `content` as whatever string the caller
// read the file as (see `## Design notes` in the README - this library
// never touches the filesystem itself). A caller that naively reads a
// binary file (an image, a compiled artifact, a font) as text ends up with
// a `content` string full of raw or mis-decoded bytes - mostly control
// characters and replacement characters, not language. Scoring that against
// keywords is meaningless, and packing it into an LLM prompt burns budget
// on tokens with no signal, potentially crowding out a genuinely relevant
// file lower in the ranking.
//
// The check mirrors the heuristic git and most diff tools use: a NUL byte
// anywhere in a leading sample of the content is treated as proof it isn't
// text, because well-formed UTF-8/ASCII source text never contains one.
// Sampling only the start keeps the check cheap on large files, at the cost
// of (rare, and harmless to miss) binary formats that place their only NUL
// byte past the sample - the same trade-off git itself makes.

const SAMPLE_SIZE = 8000;

/**
 * Decide whether a file's content looks binary rather than text.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isBinaryContent(content) {
  if (!content) return false;
  const sample = content.length > SAMPLE_SIZE ? content.slice(0, SAMPLE_SIZE) : content;
  return sample.includes('\u0000');
}
