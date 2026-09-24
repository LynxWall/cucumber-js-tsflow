---
name: verify-console-output
description: Verify terminal UI output (spinners, in-place redraws, progress lines, colors, non-ASCII glyphs) on a REAL Windows console window by reading its screen buffer back, instead of trusting a captured shell, a file descriptor to a file, or a simulated screen. Use whenever code writes escape sequences or redraws lines on stdout, whenever a worker thread or child writes to the terminal, and before telling the user that terminal output "was verified".
argument-hint: [child-script.js] [--columns 120,80,40,24] [--theme lotr]
---

# Verify console output on a real console

Claude's Bash and PowerShell tools capture stdout, so inside them `process.stdout.isTTY` is false, there is
no code page, no line wrapping, no console cursor, and no screen. Every "verification" done there is a
verification of the bytes written, not of what a person sees. In this repo that gap shipped three bugs in a
row that a simulated screen passed and a real console failed: UTF-8 bytes rendered under code page 437
(`—` became `ΓÇö`, three cells wide, so fitted lines wrapped), libuv silently dropping a `\r` that followed
a `\n` on the same TTY handle (redraws started mid-row), and lines wider than a narrow terminal (every
frame on its own row). This skill exists so that never happens again.

The rule: **output that a terminal renders is verified only by reading a real console's screen buffer.**
Simulators are fine for fast iteration on logic; they are not evidence.

## What the harness does

`scripts/launch.ps1` opens a fresh console window (Windows PowerShell, real conhost or the default terminal),
runs `scripts/console-run.ps1` inside it, which optionally resizes the console with `mode con`, runs your
node child script against the real `process.stdout`, then reads the screen buffer cell by cell with
`$Host.UI.RawUI.GetBufferContents` and writes the rows to a file. The launcher waits and prints the log and
the rows, so the result is readable from the captured shell.

Files in `scripts/`:

| File                | Purpose                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `launch.ps1`        | Run from Claude's shell. Opens the window, runs the child, prints log and screen.                        |
| `console-run.ps1`   | Runs inside the window. Resize, run node, dump the buffer. Do not run it from a captured shell.          |
| `probe.js`          | Preflight child: reports isTTY, columns, code page path, and whether a worker can open a TTY stream.     |
| `child-template.js` | Starting point for the child that drives the real component against `process.stdout`.                   |
| `trace-writes.js`   | `--require` preload that logs every TTY write from every thread, for cross-thread ordering questions.    |

Scratch files (child copies, dumps, traces) belong in the session scratchpad directory, never in the repo.

## Procedure

Run every step. Do not report a terminal feature as verified until step 5 has been done on the built
library at more than one width.

### 1. Preflight: prove the harness itself works

```powershell
pwsh -File .claude/skills/verify-console-output/scripts/launch.ps1 -Script <abs>/scripts/probe.js -Out <scratch>/probe.txt
```

Expected in the screen dump: `main: isTTY=true columns=<n>`, the glyph line showing `— … ✓` as single
characters, and `worker says tty.WriteStream ok`. The log must show `codepage=<n>` and `node exit=0`.

If any of that is missing, fix the harness first (see "When the harness misbehaves") — a broken harness that
prints nothing looks exactly like a passing test with no output.

### 2. Build the library

`yarn build` from the repo root. The child must require `cucumber-tsflow/lib/...`, never `src/`. Rebuild
after every code change before re-running; a stale `lib/` is the second-most common false positive.

### 3. Write the child

Copy `child-template.js` into the scratchpad and adapt it. Keep every ingredient listed in its header
comment: non-ASCII glyphs, a detail long enough to wrap at 80 columns, a synchronous block of the main
thread, at least two phases, and a final `cursor row/col` line. Add a `TSFLOW_THEME` (or equivalent) switch so both
themes run from one script.

### 4. Run at several widths

Run the launcher once per width; narrow widths are where layout code breaks:

```powershell
foreach ($w in 120, 80, 40, 24) {
  pwsh -File .../launch.ps1 -Script <scratch>/child.js -Out <scratch>/result-$w.txt -Columns $w -Env "TSFLOW_THEME=pickle"
}
```

`-Env` is a `KEY=VALUE;KEY=VALUE` string, not a hashtable (a hashtable does not survive `pwsh -File`).
`KEY=` with nothing after it removes the variable for the child. The launcher removes `NO_COLOR` by default:
Claude's PowerShell tool runs with `NO_COLOR=1`, the new console inherits it, and until this was found every
run through the harness had been colorless without anyone noticing (the dump does not show color).

Repeat for every theme or variant the code has. `-Columns 0` (default) keeps the window's own width.

### 5. Read the dump against this checklist

For each dump, check every line, not just the last one:

- **One line per phase.** A finished phase occupies exactly the rows its text needs at that width
  (`ceil(visible length / width)`), and no more. Repeated rows with successive spinner frames, or a phase
  line followed by a stale copy of itself, mean a redraw started from the wrong row: the row count the
  renderer moved the cursor by did not match what the console actually wrapped.
- **No fragments.** No stray text at the end of a row (e.g. the first characters of the next line starting
  mid-row). That is a cursor-position bug: a `\r` was dropped, a newline did not return to column 0, or two
  writers disagreed about where the cursor was.
- **Glyphs are single cells.** `—`, `…`, `✓` appear as themselves, once each. `ΓÇö`, `ΓÇª`, `Γ£ô` mean bytes
  reached the console without UTF-16 conversion (a raw `fs.writeSync`, not a `tty.WriteStream`).
- **Wrapped text is complete.** At a narrow width a long phase line continues on the next row with nothing
  cut and no ellipsis: nothing is fitted to the width by design (the user asked for natural wrapping, not
  truncation). The dump's `TrimEnd()` hides trailing spaces only.
- **Next thing starts at column 0.** Whatever the main thread prints after a phase (the next phase line,
  `DONE`) begins at column 0 on its own row.
- **Cursor lands where the code says.** The dump's final `cursor=row N col M` matches the layout: column 0
  of the row after the last printed text once `finish()` has run, or column 0 of the row after the open
  block while a phase is still open (the renderer parks it there so the terminal's caret never covers the
  spinner; the user noticed the caret hiding the `[` when it was parked at the top-left).
- **Animation survived the block.** The spinner frame after the synchronous block differs from before it,
  or frame count in a trace shows ~ms/interval frames during the block.

Anything failing here is a real bug. Do not rationalise it as a harness artifact until the preflight has
been re-run and passes.

### 6. When the screen contradicts the code: trace the writes

```powershell
pwsh -File .../launch.ps1 -Script <scratch>/child.js -Out <scratch>/traced.txt `
  -Env "NODE_OPTIONS=--require C:/.../scripts/trace-writes.js;TSFLOW_TRACE_FILE=C:/.../scratch/trace.txt"
```

`trace.txt` then holds every TTY write in wall-clock order with the thread that made it and the chunk with
`ESC`, `\r`, `\n` made visible. Color codes are stripped unless `TSFLOW_TRACE_COLORS=1` is also set, which is
how to check which color each frame used (the screen dump has no color information). The tracer appends, so
delete the file between runs or you will read the previous run's lines. Reconstruct what the console received in order; the bug is almost always in
the boundary between two consecutive writes (end of one, start of the next) or between two threads.
**Both paths in `-Env` must use forward slashes**; backslashes are stripped on the way into the new process.

### 7. Report honestly

State what was run (widths, themes), what the dumps showed, and anything not exercised (for example a
30-second heartbeat that needs a real 30-second stall). "Verified in a real console" means step 5 passed on
the current build; say so only then.

## Known console facts that the code must respect

Learned the hard way; each one cost a round trip with the user.

- **Write through a TTY stream, never raw bytes.** A worker thread must use `new tty.WriteStream(fd)`, not
  `fs.writeSync(fd, ...)`. Raw bytes are interpreted under the console's OEM code page (437 here); the TTY
  stream converts to UTF-16 and uses `WriteConsoleW`. `process.stdout` on the main thread already does this.
- **libuv drops a `\r` that directly follows a `\n` on the same handle** (it assumes a reordered `\r\n`).
  Use `ESC[1G` (cursor to column 1) to return to the line start, never a leading `\r`, when the previous
  write on that handle may have ended with a newline.
- **A wrapped line is redrawn from its top row, never from its last.** `ESC[1G` and `ESC[2K` act only on
  the row the cursor is on. Do not fit or truncate text to the width (the user wants lines to wrap
  naturally); instead park the cursor on the row after the block (never on the block: the terminal's caret
  would sit on the spinner), and redraw by moving up the number of rows the block occupied when last drawn,
  `ESC[0J` (erase to end of screen), the whole text written forward, and a newline. Rows per line are
  `ceil(visible length / width)`. Read the width fresh for every redraw (`tty.WriteStream#_refreshSize()` in a
  worker, which gets no resize events) so a window resized mid-phase is still redrawn in the right place.
- **`\n` through libuv's TTY path does return to column 0** on Windows (it emits `\r\n`), so a stray column
  after a newline is not a newline problem; look at the following write's leading characters instead.
- **Blocked main threads freeze main-thread timers.** Anything that must animate through a long synchronous
  `import()`/`require()` has to run on another thread with its own event loop.
- **A worker has no TTY of its own for color detection**; pass the main thread's detected level via
  `FORCE_COLOR` or colors vanish in the worker's output.

## When the harness misbehaves

Symptoms seen so far and their fixes. If you hit a new one, fix it, then **add it here** — this skill is
expected to grow.

| Symptom                                                              | Cause / fix                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `launcher exit=1`, no log, no screen file                            | The runner never started. `powershell -File` failed for these paths; the launcher uses `-Command`. Also check a parse error by running the runner inline in the captured shell: it will fail at `GetBufferContents` but show parse errors first. |
| Log written, node ran, no screen file                                | Exception in the buffer dump; read `<Out>.log` for `ERROR:`. Multi-dimensional arrays need `$cells.GetValue($y,$x)`; `$cells[$y,$x]` is a parse error in Windows PowerShell. |
| `Cannot convert ... List[String] ... to type System.Int32` in the log | A local variable collided with a typed parameter: PowerShell names are case-insensitive, so `$lines` and `[int]$Lines` are the same variable. Rename the local. |
| `Cannot find module 'C:Users...trace-writes.js'`                     | Backslashes stripped from `NODE_OPTIONS`; use forward slashes in every path passed through `-Env`.       |
| `Cannot convert the "System.Collections.Hashtable" value of type "System.String"` | A hashtable was passed to `-Env` through `pwsh -File`; only strings cross that boundary. Pass `"KEY=VALUE;KEY=VALUE"`. |
| Claude's PowerShell tool refuses the command (`Remove-Item ... blocked`) | The tool's safety filter matched regex-looking text in the command. Keep regexes out of the command line; use `foreach ($f in ...) { if (Test-Path $f) { Remove-Item $f } }` and post-process dumps in a script file. |
| Dump shows nothing after `columns=`                                  | The child exited before drawing (see log stderr) or wrote to a stream that is not the console.           |
| Dump stops at the first row of an open phase; nothing beneath it     | The runner used to read rows 0..cursor only, and the renderer parks the cursor at the top of the block it redraws, so the rest was below the cursor. The runner now reads 12 rows past the cursor and drops empty trailing rows; the dump's last line reports `cursor=row N col M`. |
| `isTTY=false` in the probe                                           | Not running in a console window: you ran `console-run.ps1` directly from a captured shell. Use `launch.ps1`. |
| No color codes anywhere in the trace, even from the main thread     | `NO_COLOR=1` reached the child. The launcher now clears it by default; if you set `-Env` with your own `NO_COLOR`, that wins. |
| Trace shows the previous run's timestamps                            | The tracer appends. Delete the trace file before each run.                                              |
| Claude's PowerShell tool refuses the command over a `\d+` "system path" | The safety filter matched a regex in the command line. Put trace parsing in a script file (see `child-template.js` for the style) and call it with node. |
| Window opens but stays open / hangs                                  | The child never exited; ensure it ends with `process.exit(0)` after a short sleep so the last writes flush. |
| `mode con` resize ignored                                            | Some hosts (Windows Terminal as default terminal) may not honor `mode con`. Check the `width=` in the dump; if it is not what you asked, run under `conhost.exe` explicitly or set the default terminal to Windows Console Host for the test. |

## Scope and limits

- Windows only as written; the read-back relies on the Windows console buffer API. On macOS/Linux the
  equivalent would be a pty (`script`/`tmux capture-pane`); add it here when needed.
- The dump shows the final screen state, not intermediate frames. For intermediate behavior use the write
  trace, or snapshot from inside the child at chosen moments.
- Timing-dependent features with long intervals (a 30-second heartbeat) are not exercised by the template;
  either wait them out in the child or unit-test the renderer with a fake clock and say so in the report.
