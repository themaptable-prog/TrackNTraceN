# Track N Trace v0.09 multiplayer

## Host from Windows

1. Extract the whole ZIP and double-click **Start-LAN-Host.cmd**. The launcher includes Python for Windows x64 and ARM64.
2. Let the host page open in the laptop’s browser. If Windows Firewall asks, allow access on **Private networks**.
3. On each guest device, join the same Wi-Fi, scan the laptop’s QR with the Camera app and open the link. Guests can also type or open the address shown under the QR.
4. Pick a vehicle and paint, then tap **Ready**. Once 2–4 players are ready, the host can start the round.

The host browser tab runs the race. Keep it and the launcher window open. If the QR opens an unreachable address and the laptop offers several network addresses, choose the Wi-Fi address from the drop-down. A guest Wi-Fi network can block communication between devices. Closing the host tab or launcher ends the room.

The same host works anywhere that can run Python 3.10 or later. Run `python3 lan_host.py` beside the game file. Use `--port 8790` to select a different port or `--address 192.168.1.20` to choose which local address appears in the QR.

## Pair directly without the laptop

1. On both devices, open the same version of **index.html** and select **Multiplayer**.
2. Choose **Host direct** on one device. Choose **Join direct** on the other and scan the host’s invite.
3. The guest gets a reply QR. Scan it on the host to complete pairing. Use **Show invite QR** for each additional guest.
4. If the in-game camera is unavailable, use **Read QR photo** with an image of the other device’s QR or transfer the text under **Copy code or link** and paste it into the other game.

Direct pairing uses WebRTC on the local network. The two scans exchange each browser’s connection details. It uses no online pairing or relay service. Both players need a browser that supports WebRTC data channels and gzip streams.

## How the lobby works

- The current chooser controls the course, laps, event, steering, damage, available hazards and soundtrack. **Next round** rotates the chooser through the lobby. Custom race and damage courses are shared with the room.
- Everyone can use the same vehicle and paint colour. Numbered name labels identify drivers.
- Changing the course or rules clears readiness for everyone. Changing your own driver clears your ready state. Sessions require the same game version.
- The host simulates positions, timing, car contact, props and dropped logs. Players who finish early can watch the other drivers. The host can end a round and return everyone to the lobby.

## Source map

| Category | Files in `source` | Responsibilities |
| --- | --- | --- |
| Network connection | `multiplayer/connection.js` and root `lan_host.py` | Versioned pairing codes, WebRTC data channels, LAN room relay, disconnects and packet transport |
| Gameplay for network | `multiplayer/gameplay.js` | Shared rules, start grid, countdown, host simulation, car collisions, snapshots and results |
| Network UI | `multiplayer/ui.js`, `multiplayer/lobby.html`, `multiplayer/ui.css` and `multiplayer/vendor` | Pairing screens, QR reading and rendering, lobby, input capture, race labels and results |
| Game integration | `interface.js`, `race.js`, `collisions.js` and `shell.html` | Shared pointer controls, frame loop, rendering, finish behaviour, prop scoring and markup insertion points |

To replace a transport, keep its connection interface and the multiplayer gameplay can use the same lobby and race messages. To build the standalone game with the existing multiplayer modules, run:

```
python source/build.py --output index.html
```

To build with multiplayer disabled, run:

```
python source/build.py --solo --output Track-n-Trace-n-solo.html
```

The QR dependencies and their licences are in `source/multiplayer/vendor`. The Windows launch runtimes come from the Python Software Foundation. Their licences are in the runtime folders.
