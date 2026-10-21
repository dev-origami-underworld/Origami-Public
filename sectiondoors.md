# Section Doors

## Target doors

Apply the seal system only to existing physical section doors:

```js
const sectionGate = _sectionGateOfDoor(door);
```

When that returns a gate, the door is a target. This excludes hub doors, cabaret doors, ordinary DungDoors, one-tile doors, and every doorway with no section-gate record.

## Door object

Keep the existing two-leaf DungDoor. Do not create a replacement door, plane, sprite, or new door model.

- Preserve the original double-door leaf geometry and `Door-1.png` texture.
- Mirror only the right leaf UVs so the hardware faces inward.
- Attach one circular seal at the centre seam, upper third of the door.
- Seal position: local door `y: 2.70`.
- Seal scale: `0.1875`.
- Seal rim: one ethereal white additive outline and a soft white outer bloom.

## Floating door label

Render the label as ethereal world-space text floating just in front of the door leaves. It must not be painted into, coplanar with, or clipped by the door-panel texture.

- Main line: `SEALED DOORS`
- Smaller line: `SECTION (#) · SPECIAL ROOM (#) · CLOSED`
- Substitute the section number and special-room number from the target door's existing section/room metadata.
- Centre both lines on the double-door seam, below the circular seal.
- Use a white, softly blooming, additive treatment that remains readable against dark mahogany.
- Remove the label with the seal when the puzzle is won.

## Puzzle

Each target door owns a puzzle state keyed by its existing `doorId`.

- Three-by-three grid.
- Three X tiles, four O tiles, two empty slots.
- A tile moves only into an orthogonally adjacent empty slot.
- Unlock when three X tiles form a horizontal, vertical, or diagonal line.
- Render the puzzle on the physical seal only. Do not add a menu, button, overlay, second canvas, or next-level control.

## Unlock

1. Bloom the three winning X tiles with ethereal white light.
2. Remove the circular seal.
3. Start the existing two-leaf door hinge animation away from the centre seam.
4. While the leaves animate, display `SECTION DOOR UNLOCKED` as ethereal combat text and play the lock-release sound once.
5. Mark this `doorId` unlocked in the existing save/state path. It remains open on return and never launches the puzzle again.

## Engine rules

- Build this in `Origami.RealityEngine.9.html`, where `_dungDoors`, `_sectionGateOfDoor`, collision, and leaf animation already exist.
- Do not modify `OrigamiUnderworld.html`; it is the shell and owns the engine iframe only.
- Use the engine’s existing safe clock and renderer path.
- Route failures through `ENGINE_ANOMALY` / Oni-Baba telemetry.

## Acceptance

For one target section door: collide/click it, solve the physical seal, observe the winning-line bloom and `SECTION DOOR UNLOCKED` while the existing leaves open, then leave and return. The passage must remain open.
