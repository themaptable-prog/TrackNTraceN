"""Assemble the standalone game from its HTML, CSS and JavaScript sources."""
import argparse
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
CORE = (
    "world.js", "course-data.js", "elevation.js", "redesigned-courses.js", "damage-courses.js",
    "presentation.js", "fleet.js", "tuning.js", "collisions.js", "race.js", "creator.js", "setup-ui.js",
)
NETWORK = (
    "multiplayer/vendor/qrcode.js", "multiplayer/vendor/jsQR.js",
    "multiplayer/connection.js", "multiplayer/gameplay.js", "multiplayer/ui.js",
)
MARKUP = {
    "NETWORK_MENU": '<button id="net-open" class="tool-button">Multiplayer</button>',
    "NETWORK_LOBBY": (SOURCE / "multiplayer/lobby.html").read_text(encoding="utf-8"),
    "NETWORK_RACE_HUD": '<div id="net-race-hud" class="hud-pill" hidden></div>',
}


def read(path):
    return (SOURCE / path).read_text(encoding="utf-8")


def build(solo):
    shell = read("shell.html")
    for name, content in MARKUP.items():
        shell = shell.replace(f"<!-- {name} -->", "" if solo else content)
    styles = read("ui.css") + ("" if solo else "\n" + read("multiplayer/ui.css"))
    shell = shell.replace("/* WORKSPACE_UI */", styles)
    files = CORE + (() if solo else NETWORK) + ("interface.js",)
    js = "\n".join(f"// {file}\n{read(file)}" for file in files)
    if not solo:
        licenses = read("multiplayer/vendor/qrcode-LICENSE") + "\n" + read("multiplayer/vendor/jsQR-LICENSE")
        js = "'use strict';\n/*\n" + licenses + "\n*/\n" + js
    return shell + js + read("end.html")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--solo", action="store_true", help="Build without multiplayer")
    parser.add_argument("--output", type=Path, default=Path("index.html"))
    args = parser.parse_args()
    args.output.write_text(build(args.solo), encoding="utf-8")
