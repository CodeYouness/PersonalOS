import { describe, expect, it } from 'vitest';

import { personNamedIn } from '@/lib/domain/people.js';

/** @param {string} id @param {string} name */
const person = (id, name) => ({ id, name });

const marta = person('person_1', 'Marta Oliveira');
const tom = person('person_2', 'Tom Fischer');

describe('personNamedIn', () => {
  it('finds a person named in full', () => {
    expect(personNamedIn('reply to Marta Oliveira about the quote', [marta, tom])).toBe(marta);
  });

  it('finds a person by a first name only they have', () => {
    expect(personNamedIn('call Marta about the quote', [marta, tom])).toBe(marta);
  });

  it('links no one when two people share the first name', () => {
    const otherMarta = person('person_3', 'Marta Rossi');
    expect(personNamedIn('call Marta about the quote', [marta, otherMarta, tom])).toBeNull();
  });

  it('prefers the full name over a shared first name', () => {
    const otherMarta = person('person_3', 'Marta Rossi');
    expect(personNamedIn('call Marta Rossi about the quote', [marta, otherMarta])).toBe(otherMarta);
  });

  it('prefers the longer of two names when one is inside the other', () => {
    const marco = person('person_6', 'Marco');
    const marcoRossi = person('person_7', 'Marco Rossi');
    expect(personNamedIn('call Marco Rossi', [marco, marcoRossi])).toBe(marcoRossi);
  });

  it('links no one when a one-word name is also someone else’s first name', () => {
    const justMarta = person('person_8', 'Marta');
    expect(personNamedIn('call Marta', [justMarta, marta])).toBeNull();
  });

  it('links no one when two people are named in full', () => {
    expect(personNamedIn('Marta Oliveira and Tom Fischer', [marta, tom])).toBeNull();
  });

  it('never matches a blank name, and ignores extra spaces inside one', () => {
    expect(personNamedIn('call Marta.', [person('person_9', '  ')])).toBeNull();
    const spaced = person('person_10', 'Giulia  Verdi');
    expect(personNamedIn('call Giulia Verdi', [spaced, person('person_11', 'Giulia Neri')])).toBe(spaced);
  });

  it('never matches a name inside another word', () => {
    const ann = person('person_4', 'Ann Lee');
    expect(personNamedIn('file the annual report', [ann])).toBeNull();
  });

  it('ignores case, and treats accented letters as part of the word', () => {
    const nicolo = person('person_5', 'Nicolò Bianchi');
    expect(personNamedIn('sentire nicolò per il preventivo', [nicolo])).toBe(nicolo);
    expect(personNamedIn('sentire Nicolòa', [nicolo])).toBeNull();
  });
});
