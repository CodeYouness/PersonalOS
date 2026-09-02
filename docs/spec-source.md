# Where this project comes from

PersonalOS is built following **_PersonalOS -- Come costruirti il sistema che
tiene insieme la tua vita, parlando a un agente_**, a guide by
**Giuseppe Castagna** (v1.0, August 2026).

- Author: Giuseppe Castagna -- <https://youtube.com/@gcastagna>
- The guide is the author's work and is **not redistributed here.** It is not
  in this repository and is listed in `.gitignore`. If you want it, get it from
  the author.

## What is ours and what is his

The guide sets out the product: the capture-and-file gesture, the seven
destinations, the eight cards, the traps worth avoiding, and the two paths --
local file storage, or a hosted database. Every good idea about *what* this
system should be came from there.

The code in this repository, the architecture, and the decisions in
`docs/decisions/` are ours, and several of them deliberately depart from the
guide. Where that happens there is an ADR saying so and why.

## The operational source of truth is this repository

`docs/spec.md` is our own product spec: it starts from the guide and diverges
as decisions are made. When something changes, it changes there, and the reason
goes in an ADR. What must never happen is the spec saying one thing, the docs
saying another and the code doing a third.
