# 04 — A malformed data file fails loudly, naming itself

**Blocked by** 01.

## Why

The document is parsed and cast to its type without any check of shape. A
truncated or hand-edited file therefore produces `undefined` where the types
promise an array, and the first card that maps over it dies with "cannot read
properties of undefined" — pointing at a component, never at the file.

That file is the only copy of the user's life. It should not be able to fail
quietly.

## What done looks like

- Reading a document missing a collection produces an error that names the
  file and the missing part, before any caller sees it.
- Reading a document from a future schema version is refused rather than
  half-understood.
- A test drives a truncated document through a read and asserts a useful
  error, not `undefined`.
- The check runs on read and stays cheap enough not to matter.

## Notes

Shape, not contents. This is a guard against a broken file, not a validation
framework, and it should not grow into one. Migration already handles old
versions; this is about documents that are not any version.
