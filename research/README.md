# Research

Research notes for cucumber-tsflow, one folder per project. A project folder keeps its whole history: the
analyses that started it, the plans, the hand-off written at the end of every session, the testing notes and the
scripts behind its measurements. The history is kept on purpose, because it records why the code is shaped the
way it is.

## Projects

| Project | When | What it covers |
| --- | --- | --- |
| [Speed enhancements](speed-enhancements/README.md) | September 2026 | Startup time on large suites: the performance work behind 8.0.0 |

## Conventions

- **One folder per project,** `research/<project>/`, named for the project and listed in the table above.
- **A `README.md` at the top of each project** states the goal and the outcome, says how the folder is
  organized, and says where to start reading.
- **Kinds of document in their own subfolders** (for example `analysis/`, `plan/`, `hand-offs/`, `testing/` and
  `scripts/`), and the tree kept shallow.
- **No machine-specific paths.** A location is written relative to its repository, such as
  `Tools.Web/VueApp` in the UIS Tools repository or `research/speed-enhancements/` in this one, never as an
  absolute path on one machine or a user-profile or temp folder.
- **Links are relative,** and anchors are GitHub heading slugs.
- **Large local artifacts stay out of Git.** CPU profiles and run logs go in a folder that the project's own
  `.gitignore` names.
