# Project skills

Repeatable procedures for agents working on PersonalOS live here, one directory
per skill with a `SKILL.md` inside.

- `land-stack/` -- `/land-stack`: squash-merge a stack of one-ticket PRs
  into main without closing or breaking the children. Its repair step is
  `scripts/repair-stacked-child.sh`.

Kept small on purpose. A procedure earns a file once it has been done by hand a
couple of times and proved worth repeating -- specification, ticketing, code
review, domain modelling, architecture review, debugging, research. Writing
nine speculative skills now would be the same mistake as writing nine
speculative abstractions.

The workflow they would formalise is already written down in
`../../docs/workflow.md`. Start there.
