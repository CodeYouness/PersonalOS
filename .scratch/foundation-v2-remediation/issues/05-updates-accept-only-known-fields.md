# 05 — Update operations accept only fields they know

**Blocked by** 01.

## Why

Create operations validate carefully. Update operations spread the patch
straight onto the record: unknown keys are written to disk, and a field typed
as a string accepts an object.

The first route that does `update(id, await request.json())` — and that will
be the first day of work on the cards — puts an HTTP body into the data file.
The asymmetry is also the kind an agent extends by copying the wrong branch.

## What done looks like

- Passing an unknown key to any update operation is rejected, and the record
  is unchanged.
- Passing a wrongly typed value for a known field is rejected.
- Fields that identify a record cannot be overwritten by a patch.
- Tests cover one create and one update per entity family, so the symmetry is
  visible rather than assumed.

## Notes

The create path is the model to align to, not the other way round. Keep the
error messages naming the offending field: they are what a future route
handler will surface to the user.
