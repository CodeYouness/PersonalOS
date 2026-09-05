# 05 — Update operations accept only fields they know

**Status:** resolved 2026-09-05.

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

## Outcome

`lib/adapters/json/index.js` gained one small helper, `validatePatch(patch,
fields)`: for every key in the patch, look up its validator in `fields` and
run it, or throw naming the key as unknown. A `PATCH_FIELDS` map per entity
family (`TASK_PATCH_FIELDS`, `PERSON_PATCH_FIELDS`, ... ten in all) lists
exactly the fields that entity's `update*` may touch, each validated by the
same function `create*` already uses for that field. Identity and timestamp
fields (`id`, `createdAt`, `updatedAt`, `source`, plus the day key that keys a
daily log and the integration name that keys a sync state) are never in a
`fields` map, so a patch naming them is rejected outright as unknown, before
`applyPatch`'s own re-assertion of `id`/`createdAt` is ever needed.

Every `update*` and the two raw-object-spread paths (`updateProfile`,
`updateDailyLog`, `updateSyncState`) now call `validatePatch` before merging.
`updateTask`'s inline `band`/`temperature` checks were folded into
`TASK_PATCH_FIELDS`, removing the duplicate validation that lived there
before. `createTransaction`'s amount-must-be-positive check became
`requirePositiveMinorUnits`, shared by both the create and update paths
instead of written once and quietly not applying to the other.

Fields with no create-side validator to align to (`Profile.habits`,
`DailyLog.meals`, and similar nested-array/record fields) are checked
shallowly -- is this an array, is this a plain object -- matching the depth
`create` itself validates them to, not inventing a deeper schema `create`
does not have either.

Left out on purpose: `upsertTransactionByOrigin`'s update-existing branch
builds its patch from a fixed object literal, not a raw spread, so the
unknown-field hole does not apply to it; validating the *types* of the
fields it forwards from a sync source is a real gap but a different one, out
of this ticket's scope.

Tests: `tests/store/adapter-contract.js` gained 11 cases across the ten
entity families -- one unknown-field rejection per family, plus a
wrong-type-rejection and an unchanged-record-after-rejection case on Task,
which exercises the shared mechanism directly. Each was watched failing
against the pre-fix adapter (the promise resolved instead of rejecting)
before the fix landed.

`npm run verify` green on all four stages, 144 tests (11 new).
