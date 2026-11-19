#!/usr/bin/env python3
"""Traegt das Anfrage-Log in eine Caddyfile ein (fuer setup-on-s1.sh).

  caddyfile_requestlog.py /etc/caddy/Caddyfile > Caddyfile.new

  - `import requestlog.caddy` einmal auf oberster Ebene, gleich nach dem
    globalen Optionsblock (der muss der erste Block bleiben)
  - `import requestlog` als erste Zeile jedes Site-Blocks

Wiederholbar: was schon da ist, bleibt, neue Sites bekommen die Zeile beim
naechsten Lauf. Alles andere in der Datei bleibt Zeichen fuer Zeichen
stehen. Ein Block beginnt mit einer Zeile, die auf "{" endet, und endet mit
einer Zeile, die nur aus "}" besteht - Platzhalter wie {host} mitten in
einer Zeile zaehlen dadurch nicht. Ob das Ergebnis gueltig ist, prueft
danach `caddy adapt`, nicht dieses Skript.
"""
import re
import sys

FILE_IMPORT = "import requestlog.caddy"
SITE_IMPORT = "import requestlog"
RE_FILE_IMPORT = re.compile(r"^import\s+(?:/etc/caddy/)?requestlog\.caddy\s*$")
RE_SITE_IMPORT = re.compile(r"^import\s+requestlog\s*$")


def code(line):
    """Zeile ohne Kommentar und Rand. Ein # beginnt nur am Zeilenanfang oder
    nach Leerraum einen Kommentar."""
    return re.sub(r"(^|\s)#.*$", "", line).strip()


def patch(text):
    lines = text.split("\n")
    has_file_import = any(RE_FILE_IMPORT.match(code(l)) for l in lines)
    out = []
    depth = 0
    kind = None            # Art des aktuellen Blocks der obersten Ebene
    seen_block = False
    pending_file_import = False
    sites = added = 0
    for i, line in enumerate(lines):
        c = code(line)
        opens = c == "{" or c.endswith(" {") or c.endswith("\t{")
        closes = c == "}"
        if depth == 0 and c and not opens and not has_file_import and not seen_block:
            # Datei ohne globalen Optionsblock: vor die erste Anweisung
            out += [FILE_IMPORT, ""]
            has_file_import = True
        if depth == 0 and opens:
            if c == "{" and not seen_block:
                kind = "global"
            elif c.startswith("("):
                kind = "snippet"
            else:
                kind = "site"
                if not has_file_import:
                    out += [FILE_IMPORT, ""]
                    has_file_import = True
            seen_block = True
            out.append(line)
            depth += 1
            if kind == "site":
                sites += 1
                # steht die Zeile schon irgendwo auf der ersten Ebene des Blocks?
                d, present = 1, False
                for nxt in lines[i + 1:]:
                    n = code(nxt)
                    if d == 1 and RE_SITE_IMPORT.match(n):
                        present = True
                        break
                    if n == "{" or n.endswith(" {") or n.endswith("\t{"):
                        d += 1
                    elif n == "}":
                        d -= 1
                        if d == 0:
                            break
                if not present:
                    indent = "\t"
                    for nxt in lines[i + 1:]:
                        if nxt.strip():
                            m = re.match(r"^[ \t]+", nxt)
                            if m:
                                indent = m.group(0)
                            break
                    out.append(f"{indent}{SITE_IMPORT}")
                    added += 1
            continue
        out.append(line)
        if opens:
            depth += 1
        elif closes and depth > 0:
            depth -= 1
            if depth == 0:
                if kind == "global" and not has_file_import:
                    pending_file_import = True
                kind = None
        if pending_file_import:
            out += ["", FILE_IMPORT]
            has_file_import = True
            pending_file_import = False
    if depth != 0:
        raise ValueError("Klammern in der Caddyfile gehen nicht auf - nichts geaendert")
    return "\n".join(out), sites, added


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as fh:
        text = fh.read()
    try:
        new, sites, added = patch(text)
    except ValueError as e:
        print(f"FEHLER: {e}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(new)
    print(f"{sites} Sites, {added} neu mit Anfrage-Log", file=sys.stderr)


if __name__ == "__main__":
    main()
