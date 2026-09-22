/**
 * Which existing person a sentence names -- one matcher for every capture
 * path that links a person, so no two paths can link the same sentence
 * differently.
 */

/**
 * The person the sentence names most completely: whoever has the most of
 * their name's leading words in it, as whole words and in any case. "Marco
 * Rossi" beats "Marco"; a first name alone counts for anyone who has it. A
 * tie is no answer -- a guess must never tie a record to the wrong person --
 * so a first name two people share, or two people named in full, links no
 * one.
 *
 * @template {{ name: string }} P
 * @param {string} text
 * @param {P[]} people
 * @returns {P | null}
 */
export function personNamedIn(text, people) {
  const sentence = text.normalize('NFC');
  let best = 0;
  /** @type {P[]} */
  let named = [];
  for (const candidate of people) {
    const words = namedWords(sentence, candidate.name);
    if (words === 0 || words < best) continue;
    if (words > best) named = [];
    best = words;
    named.push(candidate);
  }
  return named.length === 1 ? named[0] : null;
}

/**
 * How many of the name's leading words the sentence uses, together: 2 for
 * "Marco Rossi" in "call Marco Rossi", 1 in "call Marco", 0 for a blank name.
 *
 * @param {string} sentence
 * @param {string} name
 */
function namedWords(sentence, name) {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  for (let count = words.length; count > 0; count -= 1) {
    if (mentions(sentence, words.slice(0, count))) return count;
  }
  return 0;
}

/**
 * The words in a row, whole-word and case-insensitive. The boundaries are
 * Unicode letters and digits rather than `\b`, which is ASCII-only and would
 * split "Nicolò".
 *
 * @param {string} sentence
 * @param {string[]} words
 */
function mentions(sentence, words) {
  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp('(?<![\\p{L}\\p{N}])' + pattern + '(?![\\p{L}\\p{N}])', 'iu').test(sentence);
}
