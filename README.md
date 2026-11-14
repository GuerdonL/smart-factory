# Smart Factory

A canvas for building models by hand out of shapes: tensors you draw, touch together to multiply, name, and open
to define.

## Run it

    python3 server.py            # then open http://localhost:8000/

No build step and nothing to install: the page is plain files, and the server is the Python standard library.
The server also keeps saved projects in `projects/` (see `projects/README.md`) and, when run from a git checkout,
pulls its branch from GitHub every 30 seconds, so a push shows up on the next reload.

## Run it on a server, for good

On the machine, in a checkout of this repository on the branch to follow:

    sed "s#/root/smart-factory#$PWD#g; s#^User=root#User=$USER#" smart-factory.service | sudo tee /etc/systemd/system/smart-factory.service
    sudo systemctl daemon-reload && sudo systemctl enable --now smart-factory
    journalctl -u smart-factory -f       # "serving … on port 8000", then "updated to …" after each push

There is no password. Anyone who can reach the port can read and overwrite the projects.

## Where things are

- `smart-factory.html`, `.css`, `.js`: the page, its theme (every colour and typeface), and the wiring.
- `components/`: one file per thing on screen, each carrying its own markup, styles and behaviour.
- `algebra.js`, `project.js`, `zip.js`: what shapes mean, how a project is written to files, and zip; no drawing.
- `shapes/`: the kinds of block, one config each, listed in `shapes/index.json`.
- `projects/`: saved projects.
- `server.py`, `smart-factory.service`: the server and the unit that keeps it running.
