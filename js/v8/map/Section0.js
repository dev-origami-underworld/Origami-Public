/** [REF#DG-01218]
 * Section0.js — SECTION 0. The approach block is the SC-HARDENING ORIGINAL, measured from a RUN of
 * gold-v8.3-2026-08-15-8660ec3 (not from any drawing, not from memory, not from a 3-day-old commit).
 *
 * Mark 2026-08-31, after every reinterpretation failed: "you have not done anything i asked for
 * regarding hallway 0 being restored from sc-hardening version" + "bring back the guardroom I had,
 * and the caberet room itself ontop of the current map (with the hallway entranceway fixed)".
 *
 * WHAT THE GOLD ACTUALLY BUILDS (seed 12345, room records + tile render, in scratch
 * ai80-gold-hallway0.js / ai80-gold-guard.js):
 *   · ROOM 0 "Main Hall" — THE ENTRANCE HALLWAY IS HALLWAY 0. The GOLD built it 4x10 wall-inclusive
 *     = a 2-WIDE, 8-LONG vertical corridor; it is a 2-WIDE, 6-LONG one since 2026-09-08 (see HALL).
 *     Directly SOUTH of the cabaret, spawn one row above the stairs at
 *     its foot, stairs_up filling its bottom row. NO side doors. NO gate at its head — it opens
 *     straight into the ring's south corridor.
 *     ⛔ SUPERSEDED 2026-10-10 by Mark: "remove secret room in hallway0." Hallway 0 again has no
 *     side room, side door, secret seam, or secret-room identity; its end doubles are its only doors.
 *   · CABARET 6x6, stage north, and THREE door sets: SOUTH DOUBLES dead in line with the hall's
 *     two columns (walk north up the hall and the doubles + stage are straight ahead), EAST
 *     doubles onto the ring's east side, WEST single onto the west side.
 *   · GUARD POST 6x10 directly EAST of the hall, sharing its wall — and that ENTIRE shared column
 *     is the COUNTER: 10 wall tiles flagged counterWall, NO hatch, NO door onto the hall. The
 *     guard's own door is in its NORTH wall, on its midpoint, opening into the ring corridor.
 * Translated onto the CURRENT map cabaret-anchored (cabaret x55-60 z55-60, so the hall's columns
 * are the cabaret's own mid pair x57/x58), west wing + ring untouched from d387c56a/dc0887bc.
 *
 * The horizontal "hallway 1" (08-31 morning, from a two-option question Mark later rejected on
 * sight) is REMOVED, gate and all. The floor has ONE entrance again, the SC one.
 *
 * Every wall is a zero-thickness SEAM, thick rock, or a DESIGNED tile (counterWall) — the band-law
 * self-check throws on anything else. Open hall<->ring junctions use tile `doors` edge flags
 * (Engine9 _isDoor honours them; no pane, no leaf — exactly the gold's open crossing).
 */
(function (global) {
  'use strict';

  // ── THE INTERIOR, REBUILT TO MARK'S 2026-08-31 DRAWING ──────────────────────────────────────── [REF#DG-01219]
  //   His words: "section 0 is still not formed right. caberet is way too small, and your West side
  //   is totally screwed up, study screenshot, determine first what you see here that is different."
  //   ⛔ WHAT WAS ACTUALLY WRONG, MEASURED OFF THE GENERATOR BEFORE ANYTHING MOVED — the interior is
  //   x50-60 z52-63, 132 tiles, and 36 OF THEM WERE SOLID WALL: a 6x6 dead block at x55-60 z52-57,
  //   the same area as the entire cabaret, sitting unreachable in the middle of the floor. That
  //   block is what pushed the offices into a single stacked column on the west wall and squeezed
  //   the cabaret into the south-east corner. **The interior is now 132 walkable tiles and 0 rock.**
  //   FOUR CHANGES, each one a difference between his drawing and what the generator built:
  //     1. THE OFFICES ARE SIDE BY SIDE ACROSS THE NORTH, not stacked down the west wall, and they
  //        are a matched pair — his drawing shows them the same size. They were 3x4=12 and 3x8=23.
  //     2. THE WEST CORRIDOR IS AN L, not a straight full-height column: a run beneath the two
  //        offices, then down the cabaret's west side. His drawing shows exactly that shape.
  //     3. THE CABARET GAINS ITS TWO WEST COLUMNS BACK — 6 wide -> 8 wide, 36 -> 48 tiles. Scaling
  //        his drawing against the ring interior puts its west edge at x53; the old straight spine
  //        was standing in x53-54, which is precisely the width he says is missing.
  //     4. THE ROCK BLOCK IS GONE. Nothing replaces it — the offices and the corridor occupy it.
  //   ⛔ SUPERSEDED 2026-09-03 by Mark: "need to make caberet smaller and more snug ... its just the
  //     old version is cozier and cuter" — the two west columns go back to the corridor. 8x6 -> 6x6,
  //     x53-60 -> x55-60. z58-63 never moved in either direction, so the sightline is untouched.
  //     The paragraph below is kept as the RECORD of the order that widened it, and is dead law:
  //   ⚠ THE 6x6 IS NO LONGER PRESERVED, AND THAT IS THE POINT. Every earlier note in this file
  //     insists the treasured footprint is "translated, never reshaped". Mark's drawing overrides
  //     that: he says it is too small. Widening is his order, not a seat's optimisation.
  //   ⚠ z-EXTENT UNCHANGED at z58-63 — his drawing agrees with the shipped map there to the tile,
  //     so the sightline gate(57,66)(58,66) -> ring -> doubles(57,63)(58,63) is untouched.
  // ⛔ SUPERSEDED 2026-09-12 by Mark: "can you redesign the manager and dressing room? they can be much smaller" —
  //   the matched 6x5 / 5x5 pair (x50-55 / x56-60, z52-56) becomes two 3x3 closets on the same row, still north of
  //   the 舞台裏 strip and still side by side west-to-east (probe-drawn-map.js checks that, not the size). What the
  //   shrink leaves behind is ROCK: x50-52 (where the 楽屋's west half was), x56-57 between the two, and rows z52-53
  //   under the ring's north run — two clear rows, never a one-tile band with walkable on both sides (the band census
  //   rejects that; see the 風呂場 note below). Each door stays on the room's SOUTH wall, mid-row, onto the z57 strip.
  // ⛔ SUPERSEDED 2026-09-20 by Mark: "add 2 tiles on the north side of caberet - the managers door is still hidden by
  //   sake tavern. fix that so we can see the door." The cabaret grows TWO ROWS NORTH (z56-63, 6x8) and everything north
  //   of it rides up with it: the 舞台裏 row z57 → z55, its leg z58-61 → z56-61, both 3x3 offices z54-56 → z52-54, both
  //   office doors z56 → z54. The tavern complex is anchored off the cabaret's SOUTH edge (Engine9 _barAnchorN), so it
  //   stays where it stands and the two new rows are clear floor between it and the north wall — the office doors on the
  //   strip are no longer behind it. The rock rows z52-53 under the ring's north run are gone: the offices now meet the
  //   ring at a zero-thickness seam (a roomId change IS a wall here), which the band census allows; it is the ONE-tile
  //   rock band it rejects. The sightline gate → ring → doubles (57,63)(58,63) is untouched (the south edge did not move).
  const DRESS = { id: 3, x: 53, z: 52, w: 3, h: 3  };    // 楽屋 3x3            x53-55  z52-54 (was z54-56) [REF#DG-01220]
  const MGR   = { id: 4, x: 58, z: 52, w: 3, h: 3  };    // 支配人室 3x3        x58-60  z52-54 (was z54-56) [REF#DG-01221]
  // 西回廊 — an L, stamped as a BBOX that the cabaret then overwrites (same trick RING_BOX uses for [REF#DG-01222]
  // the ring's border). bbox x50-60 z57-63; CAB takes x55-60 z58-63 back out of it, leaving the
  // z57 run under the offices plus the x50-54 leg down the cabaret's west side = 41 tiles.
  // ⭐ THE CARVE IS THE ONLY WRITER for x53-54 z58-63. Those columns are stamped corridor here and
  //   the cabaret used to take them back out; it no longer does, so they return with NO new
  //   stamping. Widening the leg as a separate edit would make two writers for one region.
  const SPINE = { id: 2, x: 50, z: 55, w: 11, h: 9 };   // plaza bbox rides up 2 with the cabaret (non-minimal path only) [REF#DG-01222]
  // ── FLOOR-1 MINIMAL CUT ────────────────────────────────────────────────────────────────────── [REF#DG-01463]
  //    Floor 1 reduced to Hallway 0 + the 番所 + section 0: a 2-tile door at the hall gate, no locked
  //    doors, 1-tile doorways typed `shoji_door`. The order this implements and its wording are
  //    recorded in knowledge/design/AI4_BUILD_SECTION0_2026-09-05.md; this comment only describes
  //    what the code below stamps.
  //    Selected by `window._floor1Minimal !== false` (see the MINIMAL binding below for the actual test).
  //    When that test is false the pre-09-05 floor is stamped instead (east wing + sections 1-3 + the
  //    11x7 West Corridor plaza) exactly as before — nothing below is deleted, it is switched.
  //    THE BACKSTAGE STRIP replaces the plaza. Measured off the gold run (8660ec3 L1, node render, AI 2
  //    2026-09-05): gold room 1 = 6x6 core + an L strip — row z61 x59-66 (8) and column x59 z62-65 (4) —
  //    entering the core by ONE west door at core row +2. Gold wall rows collapse to seams here, so the
  //    same figure in this frame is row z57 x53-60 (H1x8) + column x54 z58-61 (H1x4), and the door is the
  //    existing CWEST (55,60). Rock x50-53 z58-63 comes back where the plaza's 5-wide leg was.
  const STRIP_BOX = { id: 2, x: 53, z: 55, w: 8, h: 7 };   // Creator bbox for the L (the CAB stamp sits inside it) — z55-61 since 2026-09-20 [REF#DG-01464]
  const STRIP_ROW = { id: 2, x: 53, z: 55, w: 8, h: 1 };   // 舞台裏 row under the offices  x53-60 z55 (was z57) [REF#DG-01465]
  const STRIP_COL = { id: 2, x: 54, z: 56, w: 1, h: 6 };   // 舞台裏 leg down the cabaret's west side  x54 z56-61 → CWEST (55,60) (was z58-61) [REF#DG-01466]
  // ⚠ RENAMED from "Hallway 0": in the SC-hardening build HALLWAY 0 IS ROOM 0, THE ENTRANCE HALL [REF#DG-01223]
  //   (gold room record: id 0, "Main Hall", type hallway). Calling this west corridor "Hallway 0"
  //   is how two seats spent a day fixing the wrong hallway. The name follows the gold.
  // ⚠ MOVED SOUTH 3 TILES, NOT RESIZED (Mark 2026-08-31: "across from this hallway door should be
  //   the entrance 2-tile door to caberet … the caberet should be right behind this wall").
  //   Was z55-60 with the 玄関口 approach (2x3, z61-63) standing between it and the ring, which put
  //   the cabaret THREE TILES further back than the gate it is supposed to face. The approach is
  //   gone and the room took its place. The 6x6 footprint is UNTOUCHED — it is translated, never
  //   reshaped: this is the treasured room and its shape is not ours to change.
  //   Sightline now, walking north up hallway 0: gate (57,66)(58,66) -> ring z64-65 -> cabaret
  //   entrance doubles (57,63)(58,63). Two tiles of ring between them, nothing else.
  // ⛔ SUPERSEDED 2026-09-24 by Mark: "make caberet 1 tile shorter" — the north row z56 comes off (6x8 → 6x7, x55-60 z57-63). [REF#PENDING]
  //   The freed row and the strip row above it (x55-60 z55-56) are carved to rock below, so the NW-corner west door opens west only.
  const CAB   = { id: 1, x: 55, z: 57, w: 6, h: 7  };    // ROOM 1 — 6x7 since 2026-09-24  x55-60 z57-63 [REF#DG-01224]

  // ── THE RING: ONE 2-tile hallway squared around the core ────────────────────────────────────── [REF#DG-01225]
  const RING_ID = 5;
  const RING = [
    { x: 48, z: 50, w: 15, h: 2 },      // north run  x48-62  z50-51 [REF#DG-01226]
    { x: 48, z: 64, w: 15, h: 2 },      // south run  x48-62  z64-65 [REF#DG-01227]
    { x: 48, z: 52, w: 2,  h: 12 },     // west leg   x48-49  z52-63 [REF#DG-01228]
    { x: 61, z: 52, w: 2,  h: 12 }      // east leg   x61-62  z52-63 [REF#DG-01229]
  ];
  const RING_BOX = { id: RING_ID, x: 48, z: 50, w: 15, h: 16 };

  // ── THE WAY ON: A 2-TILE HALLWAY EAST, DEAD IN FRONT OF THE CABARET'S EAST DOOR ─────────────── [REF#DG-01230]
  //   Mark 2026-08-31: "add that the East Door of Caberet heads into the main hall and in front will
  //   always be the main 2-tile hallway that leads into section 1. players can bypass it and go
  //   elsewhere, but this will help be more natural progression."
  //   ⚠ BUILT AS THE MIRROR OF A RELATIONSHIP HE ALREADY SIGNED OFF, not as a new idea: the hall
  //     gate (57,66)(58,66) faces the cabaret's south doubles (57,63)(58,63) across two tiles of
  //     ring. This is the same figure rotated — the cabaret's EAST doubles (60,60)(60,61) face this
  //     corridor's mouth (63,60)(63,61) across the ring's east leg (x61-62). Step out, cross two
  //     tiles, and the way on is straight ahead.
  //   ⚠ IT DOES NOT CUT THE RING. The corridor starts at x63, OUTSIDE the east leg. Taking x61-62
  //     for the corridor would have given those two tiles a different roomId, and a roomId change is
  //     a WALL in this architecture — it would have severed the ring into two dead ends at exactly
  //     the point the player is meant to pass. "Players can bypass it and go elsewhere" is his
  //     sentence and it only stays true if the ring stays whole.
  //   ⚠ SECTION 1 IS NOT BUILT HERE. The corridor ENDS at x69 and its last column is flagged
  //     `sectionExit` — the attachment point, nothing more. Building section 1 is a separate order.
  //   ⚠ LENGTH IS NOT FREE — IT MUST BE A CATALOGUE SHAPE. My first cut was w:6 (floor x64-68), a
  //     5x2 footprint, and Creator rejected it on Mark's own 2026-08-22 rule: `room-shape: ROOM_008
  //     footprint 5x2 at (64,60) is NOT in the RoomShapes catalogue`. It SHIPPED ANYWAY because
  //     `_creatorAuthority` is "report", which is exactly how a rule gets ignored into law. HALLS are
  //     H2x2/3/4/6/8/10/12/16 — there is no H2x5. w:7 makes the FLOOR x64-69 = H2x6.
  //     ⚠ Creator measures the FLOOR footprint, excluding the door tiles at x63 — so the room rect is
  //       one wider than the shape it must match. Counting the door column is how I got 5x2.
  const EASTHALL = { id: 7, x: 63, z: 60, w: 7, h: 2 };  // 2 wide, x63-69 z60-61 — floor x64-69 = H2x6 [REF#DG-01231]
  const EHDOOR   = [[63, 60], [63, 61]];                 // its mouth, facing the cabaret's east doubles (NOT part of the H2x6 floor shape) [REF#DG-01232]

  // ── THE APPROACH — the SC-hardening cluster, gold-anchored ──────────────────────────────────── [REF#DG-01233]
  //   Gold relative law: hall columns = the cabaret's mid pair; doubles at the cabaret's south
  //   wall on those same columns; hall runs south from the ring; guard EAST of the hall behind a
  //   half-length counter on the shared SEAM (northern half only); guard door north onto the ring.
  // 玄関口 (APPR, id 7) DELETED 2026-08-31 on Mark's order — the cabaret now occupies z61-63 itself,
  // so the approach corridor it used to reach has no space and no purpose. Floor 1 is 7 rooms now.
  const HALL = { id: 0, x: 57, z: 66, w: 2, h: 8 };      // ROOM 0 / HALLWAY 0 — gate row z66 + floor z67-72 (2x6 = H2x6) + stairs z73 [REF#DG-01234]
  // ⛔ SUPERSEDED 2026-09-08 by Mark: "fix hallway entrance as requested" / "oh 2 tiles shorter" [REF#DG-01520]
  //    — h 10 → 8. The gold's 2-WIDE, 8-LONG hall (header above) was measured 1:1 off 8660ec3 and
  //    held as law; his newer order shortens the walk-in by two rows. The floor run is now 2x6.
  //    STAIRS and SPAWN below move with it — all three are one measurement, never edit one alone.
  //    Side effect worth keeping: the hall's south end is now FLUSH with the 番所's (both end z73),
  //    where it used to overhang the guard room by two rows.
  const GUARD = { id: 6, x: 59, z: 66, w: 5, h: 8 };     // 番所 5x8 = R5x8   x59-63 z66-73 [REF#DG-01235]
  // ⚠ MARK 2026-08-31: "only half of guard room wall should have a counter." The NORTHERN half of [REF#DG-01236]
  //   the shared wall — 4 designed counterWall tiles at (59,66..69) — is the counter; the southern
  //   half (z70-73) is NO TILE AT ALL: a zero-thickness full-height divider seam, which is what a
  //   full wall IS in this architecture. Matches his 08-30 sentence too ("half that wall is
  //   halfheight along the northern corner"). The counter tiles carry roomId 6 — they are part of
  //   the 番所's footprint, and room-ragged counts designed tiles as owned since this commit.
  const COUNTER_COL = { x: 59, z0: 66, z1: 69 };         // northern half only — 4 flagged FLOOR tiles, NO hatch [REF#DG-01237]
  // ⚠ THE COUNTER IS A SEAM, NEVER A TILE. The flag rides the 番所's OWN WEST FLOOR COLUMN and the [REF#DG-01238]
  //   counter is the single x58|x59 divider pane, dropped to _counterFrac(). It is NOT a column of
  //   wall tiles: a wall tile between two walkables is 2 metres thick and draws a face on EACH side,
  //   a grid apart — measured 2026-08-31 as ten 0.42 slabs in two rows, which is the "field of
  //   crates" Mark rejected, and the reason no timber top was visible from the hall.
  //   This also retires the band-law exemption these tiles needed: there is no wall tile left here
  //   to exempt. See knowledge/design/SEAM_WALL_MODEL_2026-08-24.md.

  // ── DOORWAYS. A door tile is a walkable tile ON the room side of the seam it opens. ─────────── [REF#DG-01239]
  const CSOUTH = [[57, 63], [58, 63]];                   // CABERET ENTRANCE DOUBLES — dead across the ring from the hall gate (gold (63,69)(64,69)) [REF#DG-01240]
  const CEAST  = [[60, 60], [60, 61]];                   // CABERET east doubles → ring east leg (gold (66,65)(66,66)) [REF#DG-01241]
  // ⛔ SUPERSEDED 2026-09-24 by Mark: "move the manager door there authorized personnel only there at that corner north_west wall to west of stage" — (55,60) → the NW corner, west wall. [REF#PENDING] [REF#DG-02203]
  const CWEST  = [55, 57];                               // CABERET west single (staff door) → west corridor, at the cabaret's north-west corner [REF#DG-01242]
  // ⛔ SUPERSEDED 2026-09-21 by Mark: "fix dressing room manager office door 2 tiles north on wall" — both office doors move [REF#DG-02119]
  //   TWO TILES NORTH, from the south row (z54, onto the 舞台裏 strip) to the NORTH row (z52), so they open onto the ring's
  //   north run (z50-51) at the zero-thickness seam. The Creator door records below say side 'n' and connect to the RING,
  //   and Engine9's backstage plaque (~:20651) mounts on whichever face the door tile sits on.
  // ⛔ SUPERSEDED 2026-09-30 by Mark: "remove those doors to the North of the section 0 ... redesign it so those rooms are only accessed [REF#DG-01243]
  //    via that door in caberet only" — DDOOR (54,52) and MDOOR (59,52) are gone. The 楽屋 and the 支配人室 open only onto the backstage
  //    passage (DEAST / MWEST below), and the passage opens only into the cabaret through NDOOR. The two tiles are plain floor of their
  //    rooms, and their seam to the ring's north run is walled like every other room edge. Register entry at the top of Origami.RealityEngine.9.html.
  // THE BACKSTAGE DOOR (Mark 2026-09-27: "the route to the dressing room is fucked up. so i figure lets put the door on that north wall to [REF#DG-02205]
  // the west of the stage, that 1 tile there. so players can see it when they first walk in."): a door in the cabaret's north wall at
  // x56 (the tile west of the stage), a short backstage passage north between the two closets, and a door from it into each closet —
  // the 楽屋's east wall and the 支配人室's west wall (the office one under the same manager lock as its north door). The passage ends
  // at the ring on a shoji seam (a pane, not a door). The Manager walks out of this door onto the stage; the dressing room is reached from inside.
  const NDOOR  = [56, 57];                               // cabaret NORTH wall, the tile west of the stage → backstage passage [REF#DG-02206]
  // the passage is TWO wide between the closets and runs up to the ring seam (a pane there, no door): the generator's band check [REF#DG-02207]
  // refuses any single wall tile left between two walkables, MEASURED at 56,52 and 57,53-54 on the first cut
  const BACKSTAGE = [[56, 56], [56, 55], [56, 54], [57, 54], [56, 53], [57, 53], [56, 52], [57, 52]];   // the passage, west-corridor room id [REF#DG-02208]
  const DEAST  = [55, 53];                               // 楽屋 EAST wall, mid-row → backstage passage [REF#DG-02209]
  const MWEST  = [58, 53];                               // 支配人室 WEST wall, mid-row → backstage passage (manager lock) [REF#DG-02210]
  const GDOOR  = [61, 66];                               // 番所 north wall → ring south run (midpoint x61 of x59-63) [REF#DG-01245]
  // ── 風呂場 — THE BATHHOUSE, SECTION 4, BEHIND THE GUARD (Mark 2026-09-08) ──────────────────── [REF#DG-01580]
  //    "bathhouse is section 4, after the guardhouse, it has a door to this room. it has a big
  //     circle in it. 3d bath." and, correcting me the same day: "section 0 does not have the
  //     bathhouse". IT IS SECTION 4, NOT SECTION 0 — see the `_secOf` seeding below, which is the
  //     ONLY thing that puts it there. The 番所 is drawn with the core by rect(), not by the SECS
  //     loop, so a room added beside it inherits the segmentId 0 that `cell()` hardcodes unless it
  //     is seeded explicitly. That is the whole reason this warning exists twice in this file.
  //    DIRECTLY EAST of the 番所 (x59-63) with no gap: floor x64-71, so the two rooms share the
  //    x63|x64 seam and the door sits ON that seam — the same zero-thickness divider model the
  //    counter uses, not a wall tile between two walkables.
  //    REACHED ONLY THROUGH THE GUARD ROOM, which is the point: section 4 stays locked until
  //    sections 1-3 are activated, so the bath is behind that same lock by geometry, not by a
  //    second rule that could drift away from it.
  //    ⚠ TEMP BUILDING (Mark: "just make it temp building, i will build 3dbathouse"). The room, [REF#DG-01581]
  //      its door, its section membership and a PLACEHOLDER ring for the big circular bath are
  //      what ship here. The real 3D bath is Mark's; do not elaborate this into one. [REF#DG-01582]
  //    SHAPE, Mark 2026-09-08: "bathhouse is a 15x15 room with two large bath as circles, ok?
  //    nothing more" and "it has a 7 tile hallway connecting one of its sides to the east wall of
  //    guard room". So the bath is NOT flush against the 番所 any more — a 7-tile spur stands between
  //    them, and the room is 15x15 to hold two large circles side by side.
  //    ⚠ z68, NOT z66 — 倉庫/Junk Store (room 26, section 3) occupies x81-86 z62-65 and the 15-wide
  //      bath reaches x85, so starting at z66 would put section 4's north wall flat against section
  //      3's south wall with no door and no rock between. Two clear rock rows (z66, z67) keep them
  //      apart; ONE row would be a 1-tile band with walkable on both sides, which the band census
  //      exists to reject. Measured before placing, not adjusted afterwards.
  const BATH_WING = {
    bath: { id: 27, x: 64, z: 71, w: 8, h: 8 },
    passage: { id: 28, x: 64, z: 69, w: 7, h: 2,
      parts: [{ x: 64, z: 69, w: 7, h: 2 }] },
    guardDoor: [[64, 69], [64, 70]],
    bathOpening: [[69, 71], [70, 71]]
  };
  const BHALL = BATH_WING.passage;
  // ── THE SECRET PORTAL ROOM, BEHIND HALLWAY 0'S WEST WALL (2026-10-01) ────────────────────────────────────────── [REF#DG-02297]
  //    ⛔ SUPERSEDED 2026-10-10 by Mark: "remove secret room in hallway0." The history below explains the deleted carve;
  //    no constants, floor tiles, entrance edge, door, room record, footprint, or persistent room id remain.
  //    knowledge/design/SECRET_PORTAL_ROOM_2026-10-01.md. A 5x5 room the player reached by walking through the middle of
  //    the hall's west wall — the pane is drawn like every other pane on that wall and only its movement collider is left
  //    out (Engine9's thin-wall builder reads `secretEdges`). It holds the torii portal to the Invading Realms.
  //    WHY THE WEST WALL: the hall's north end is its open double door into the ring, and its east wall is the Guard Post's;
  //    everything west of x57 from z66 down is solid rock, so it is the only side a 5x5 fits without moving anything.
  //    WHY z69-73 AND NOT CENTRED ON THE HALL: R-209 — rock between two walkables is 0 tiles (a seam) or ≥3, never 1 or 2.
  //    The ring's south arm is z64-65; a room starting at z67 leaves a 1-row band (throws) and at z68 a 2-row gutter
  //    (the measured collider fault). z69 leaves three rows. The secret edge itself sits at z70, the middle of the hall.
  //    The room's id is the next free index (rooms[] index must equal id) and is assigned where it is carved, last.
  //    Off: global._secretPortalRoom = false.
  //    ⛔ SUPERSEDED 2026-10-07 (the order and the choice: knowledge/design/PORTAL_ROOM_NORTH_2026-10-07.md) — the room moves 3 tiles
  //    NORTH to z66-70: its north row sits flush on the ring's south run (z64-65), a 0-tile seam, which R-209 allows (the 1- and
  //    2-row bands above are what it forbids). 6 north was asked for; it would overlap the cabaret's bottom row (z63) and room 1
  //    never moves, so 3 is the most that fits without touching the ring or the cabaret. The door moves with it to z67, the
  //    hall's first floor row under its double-door row.
  // ── HOW THE PLAYER GETS IN (2026-10-01): 'shoji' — an ordinary 1-tile shoji door on that edge, the room's own edge tile, the way [REF#DG-02300]
  //    every other door on this floor is authored (`door()` above) · 'secret' — the walk-through wall (pane drawn, collider left
  //    out, `secretEdges`). It is a shoji door FOR NOW, and becomes the secret door later: flip this one value. The order and
  //    its wording: knowledge/design/SECRET_PORTAL_ROOM_2026-10-01.md.
  // Mark 2026-10-14: portal room stays west of hallway 0 and moves north until it also meets the main hall.
  const SECRET = { id: -1, x: HALL.x - 5, z: HALL.z, w: 5, h: 5 };
  // The Hallway 0 doorway is the first floor row south of its north double doors. [REF#DG-02328]
  // The centre seam is one tile too far south and leaves Nemesis facing a wall.
  const SECRET_EDGE = [SECRET.x + SECRET.w - 1, SECRET.z + 1];
  const SECRET_NORTH_EDGE = [SECRET.x + Math.floor(SECRET.w / 2), SECRET.z];
  const SECRET_ENTRANCE = 'shoji';
  const BATH = BATH_WING.bath;
  const GATE   = [[57, 66], [58, 66]];                   // ⚠ MARK 2026-08-31: "needs door at end - double door leading [REF#DG-01246]
  //   to the intersection." The hall's head row IS the 2-tile double door onto the ring — span 2, [REF#DG-01247]
  //   so the Door-1 leaves mount engine-side. (The gold's junction was open; his word is newer.)
  // ── STAIRS DOWN LIVE IN THE 番所 (2026-09-02) ─────────────────────────────────────────────────
  //    Moved out of the 支配人室 (was 58,54). The guard room is the floor's LAST room — sealed until
  //    all four section keys turn — so putting the way down inside it makes the lock the actual gate
  //    on finishing the floor instead of a detour beside it.
  //    (62,71) is chosen to clear the room's two fixtures: the counter column (x59, z66-69) and the
  //    north doorway at (61,66). The stair well is a 2.6-deep pit spanning its whole tile, so it must
  //    not share a tile with either.
  //    ⚠ The 3D staircase ALREADY EXISTS and needs nothing built — Engine9 ~:18650 raises a solid
  //      flight of ten cumulative-height risers plus four masonry underwalls for ANY `stairs_down`
  //      tile. Moving the tile moves the staircase.
  const DOWN   = [62, GUARD.z + GUARD.h - 1];
  const STAIRS = { up: [57, 73], upR: [58, 73] };        // the hall's bottom row, both columns — was z75, moved with the 09-08 shortening [REF#DG-01249]
  // ── SECTIONS 1-4 ────────────────────────────────────────────────────────────────────────────── [REF#DG-01292]
  //    MEASURED BEFORE BUILDING (scripts/probe-sections.js, generator section0, level 1, 25 seeds):
  //    8 room records, ALL sectionIndex 0, `gates: []`, and 300 assertion failures — "section N has
  //    NO rooms" for N=1..4 on every seed. The east passage already carried a `sectionExit = 1` flag
  //    with, in its own words, "nothing is built beyond it yet". This builds what is beyond it.
  //
  //    SHAPES ARE CATALOGUE-LEGAL BY CONSTRUCTION, not by hope: RoomShapes.json caps rooms at 8x8,
  //    so the specials are R8x7. A 10x7 room — the obvious first choice — is off-catalogue; only
  //    CABARET_10x7 is exempt.
  //    ⛔ SUPERSEDED 2026-09-07: this line used to read "and halls at H2x16 … the spurs H1x6 and the
  //    trunk H2x12". THE CATALOGUE NO LONGER CAPS HALLS AT 16 — H1x12/H1x16/H2x12/H2x16/H3x12/H3x16
  //    were retired that day under Mark's 2026-09-05 "halls max 10 (usually 4-5)" rule, and this
  //    sentence is exactly how the old ceiling stayed live: it read as a statement of the law while
  //    being a stale quotation of it, and the three wing spines below were authored H1x16 against it.
  //    The ceiling is H2x10 / H1x10; the spurs are H2x6 and the trunk is H2x10.
  //
  //    A FLOOR HAS SECTION 0 PLUS SECTIONS 1-4. THAT IS THE WHOLE SET — there is no section 5 and
  //    adding one is not an extension, it is an error. An earlier revision of this file built eight
  //    (bathhouse/dojo/archive/forge, invented here rather than taken from any spec) and they were
  //    deleted. `scripts/probe-sections.js` defines special-room identities for 1-4 ONLY, and that
  //    is the contract stating the count, not a gap left open for more.
  //
  //    THE FOUR SECTIONS ARE PEERS, NOT A LADDER, and they surround the core rather than queueing
  //    off one side: 1 and 2 EAST off the trunk, 3 WEST and 4 NORTH straight onto the ring — the
  //    hall that surrounds section 0. No section sits behind another and none is a prerequisite.
  //
  //    ⛔ SUPERSEDED 2026-09-02 — the paragraph that stood here said "EVERYTHING STAYS ON segmentId 0 [REF#DG-01292]
  //    DELIBERATELY. The streamer seals segments, and a sealed segment is invisible." It went [REF#DG-01295]
  //    unmeasured: the streamer was read, the belief formed, and it was written down as a design
  //    decision without a single run behind it.
  //    ⚠ WHAT IT COST, measured at tile level: all 593 walkable tiles carried segmentId 0, so
  //      `section-tile-parity` reads `tiles say {0:17}` against `records say {0:9,1:2,2:2,3:2,4:2}`.
  //      **Every section-aware system in this engine reads the TILES**, so the floor had ONE section
  //      while every record, log and room-type census said five. The rooms were built and the floor
  //      still reported itself finished when it was not.
  //    ⚠ THE FALSIFICATION IS ONE SENTENCE: floors 2+ stream four sections through this exact
  //      machinery on every run. "A sealed segment is invisible" describes streaming WORKING, not a
  //      hazard. Sections are BOTH axes — identity and streaming — and splitting them was never the
  //      risk I claimed it was.
  //    Sections 1-4 now carry segmentId 1-4 on their tiles, records and Creator rooms, and the
  //    returned `segments` array publishes one entry each. Off: nothing — this is the correct shape.
  // ⛔ SUPERSEDED 2026-09-07 by Mark's 2026-09-05 hallway law, enforced after MAP_CENSUS caught it:
  //    was `w: 12` (H2x12, x71-82). Oni-Baba's map ring reported it RED on the first floor that ever
  //    booted with sections on — "SPAN hallway exceeds MAX_CORR=10: 12 tiles (x [71,60]→[82,60])".
  //    12 was never legal under "halls max 10"; it shipped because RoomShapes.json still sold H2x12 as
  //    a first-class catalogue entry (now retired — see that file's $comment).
  //    ⚠ THE TRUNK IS THE ONE CORRIDOR THAT COULD BE FIXED BY A NUMBER, and that is because nothing
  //      hangs off it — it is a connector, not a distribution corridor. The three wing spines could
  //      NOT, and were re-authored instead (see SECS below).
  // ⛔ SUPERSEDED 2026-09-13 by Mark: "see how too long these hallways are? they are 3x way too long - takes so
  //    long just to get to a door. fix that next so a section connection has doors along the hallway too and
  //    rooms all along." — the TRUNK (H2x10, x71-80) is DEAD. Measured before this edit: the East Passage + Trunk
  //    made ONE straight 18-tile street (x63→x81) with no room door on it at all — only connector doors at x63,
  //    x70 and the section gate at x81; the first room door was at x84. The trunk was "a connector, nothing hangs
  //    off it" (its own note), and that is exactly what he is rejecting.
  //    NOW: the East Passage (H2x6) IS the section connection, with a room on each side of it, and section 3
  //    starts right where the trunk used to — its gate is the old TDOOR column x70, everything in the wing
  //    shifts 11 west. Walking east from the cabaret: mouth x63 → 帳場/物置 doors at x67 → gate x70 → 古道具庫 /
  //    荷捌き場 doors at x73 → 木箱置場 x74 → 倉庫 x75. A door every 3-4 tiles; the last room door is 12 tiles
  //    from the ring instead of 23.
  //    ⚠ ID 8 IS KEPT, NOT FREED: rooms[] index must equal id (assert below) so a hole at 8 would throw. The
  //      trunk's id now names the north passage room. The south one takes the next free id, 29.
  //    ⚠ SPACING IS 0 OR ≥3, NEVER 1 OR 2 (R-209). One rock tile between walkables is a band (the self-check
  //      below throws); TWO is the gutter the engine's 2-thick pair merge turns into one pane standing in the
  //      middle of the gap while both colliders stay on the tile edges — MEASURED on the first cut of this
  //      layout (rooms at x65): 6 colliders with no surface on the ring leg's east face, plane 125.03. So both
  //      rooms sit FLUSH on the ring's east leg (x63, a seam), which puts their corner tiles (63,59) and
  //      (63,62) beside the passage's mouth doors — legal now that a door tile owns only its far side
  //      (Engine9 `_doorOwnsEdge`, same day); the seam between a mouth door and the room beside it is a wall.
  //      East of the 帳場, x67-70 stay rock (4) before the wing's x71 room. 物置 is 4 tall so its bottom row meets
  //      the 番所's top row (63,66) on a seam instead of leaving one rock between them; its other columns then
  //      stand 3 rock above the bathhouse spur (z69).
  //    ⛔ SUPERSEDED 2026-10-01: 物置 — the 7-Eternal — is 8 wide, x63-70 (it was 4 wide, x63-66, with x67-70 rock to
  //      its east). R-209 left two widths on that side: 5 (x63-67, three rock before x71) and 8 (x63-70, a seam). At 8
  //      its east wall is a seam with the section-3 room at x71 (z62-64), (71,65) is rock, its north-east tile (70,62)
  //      sits beside the section-3 gate tile (70,61) the way (63,62) sits beside the mouth door, and its bottom row
  //      x64-70 stands 3 rock above the bathhouse spur (z69). The (63,62) corner and the door (65,62) are where they
  //      were; the engine finds the door by its tile, since it is no longer on the room's midpoint column (cx 67).
  const OFFICE_E = { id: 8,  x: 63, z: 57, w: 4, h: 3 };   // 帳場 R4x3, north of the passage, on the ring leg  x63-66 z57-59 [REF#DG-02049]
  const STORE_E  = { id: 29, x: 63, z: 62, w: 8, h: 4 };   // 物置 R8x4 (the 7-Eternal), south of the passage, on the ring leg  x63-70 z62-65 [REF#DG-02050]
  const ODOOR    = [65, 59];                               // 帳場 south wall → passage (65,60) [REF#DG-02051]
  const SDOOR    = [65, 62];                               // 物置 north wall → passage (65,61) [REF#DG-02052]
  //    HOST: which section-0 room the gate hangs off. 'trunk' is the east trunk (itself section 0, [REF#DG-01296]
  //    reached through the east passage); 'ring' is the 回廊 that surrounds the core — the main hall.
  //    Sections west and north hook straight onto the ring's own legs (west x48-49 z52-63, north run
  //    x48-62 z50-51), so the hall that surrounds section 0 is what carries them.
  // ── SECTIONS 1-3: WEST · NORTH · EAST (Mark 2026-09-02, on his hand-drawn map) ──────────── [REF#DG-01296]
  //    "lets change it to 3 sections for floors. Each section will have 6-8 rooms +1 per floor. Each
  //    section has a special room." then, on the count: "west should have 4-6 rooms, north should be
  //    same and east." and on the numbering: "1 west 2 north 3 east".
  //
  //    ⛔ SUPERSEDED 2026-09-02 — the table here held FOUR sections with 1 and 2 BOTH hanging off the
  //    east trunk, one room each. Two failures, and the second was visible from the floor: [REF#DG-01298]
  //      · THE NUMBER IS THE DIRECTION NOW. Measured before rewriting, from each section's own tile
  //        centroid against the cabaret's: 1 [72.6,48.9] EAST · 2 [82.2,48.9] EAST · 3 [36.5,53.0]
  //        WEST · 4 [51.6,38.9] NORTH. Every one was in the wrong place for its number, so this is a
  //        RELOCATION, not a renumber — the building-to-number mapping happening to match is what
  //        made that easy to miss.
  //      · SECTION 4 IS GONE, casino and all. The 09-02 drawing has three legs and the 番所 stays in [REF#DG-01299]
  //        core. The casino is deliberately NOT rehomed: a building nobody asked to move is how a
  //        room ends up somewhere by accident.
  //
  //    ⚠ SIZES CAME FROM A MEASUREMENT, NOT A GUESS — scripts/probe-leg-packing.js greedy-packs
  //      catalogue rooms into each leg's free rock demanding a 1-tile rock border (so >=2 tiles
  //      between rooms, which is what the band rule needs): WEST 75 · NORTH 39 · EAST 36 at 8x7. [REF#DG-01300]
  //      Against an ask of 4-6 there is no packing pressure at all, so rooms are kept at full
  //      catalogue size rather than shrunk to fit. I had warned the opposite; the warning was wrong.
  //
  //    THE SHAPE OF A LEG, one sentence: the ring (or the trunk) → a GATE tile → a short SPUR → a
  //    long DISTRIBUTION corridor → rooms hanging off it, each touching the corridor so its doorway
  //    is an edge tile of the room, exactly as the 番所's door works. Rooms are separated from each
  //    other by TWO tiles of rock, never one — one tile of rock with floor on both sides is a double
  //    wall and Section0's own self-check throws on it. It caught me at (77,45) once already.
  //    ⛔ SUPERSEDED 2026-09-07 by Mark: "go - fix the packer" — ROOM-TO-ROOM IS NOW **ZERO**, THE [REF#DG-01305]
  //    SAME AS ROOM-TO-CORRIDOR. What stood here: "EVERY ROOM-TO-ROOM AND ROOM-TO-SPUR GAP IS THREE
  //    TILES, NOT TWO, AND THAT IS LOAD-BEARING GEOMETRY RATHER THAN STYLE. MEASURED: all 29 orphan
  //    colliders on this floor sat on a wall EXACTLY 2 tiles thick with floor on both sides — a
  //    thickness histogram of {2: 29}, no exceptions. That is the precise trigger of Engine9's
  //    shared-wall PAIR MERGE, which hides BOTH outer faces and draws ONE pane at the centre: the
  //    wall then stands a tile behind the collider, doors detach from it, and corners stop meeting.
  //    At 3 thick the merge's own `_openT(wE2)` test fails, so each face keeps its pane. ONE IS
  //    ILLEGAL, TWO IS THE MERGE, THREE IS CLEAN."
  //    ⭐ THAT MEASUREMENT WAS RIGHT AND ITS CONCLUSION WAS ONE OPTION TOO SHORT. It enumerated 1, 2
  //      and 3 and never asked about **0** — and 0 was sitting in the very next paragraph of this
  //      same block, already shipping, already proven: "ROOM-TO-CORRIDOR STAYS AT ZERO — rooms TOUCH
  //      their corridor... A seam is not a wall and produces no orphan; section 0 is the proof."
  //      Room-to-room at 0 is that identical mechanism: two walkable tiles carrying different
  //      roomIds, one divider pane, one collider, no wall TILE for the pair merge to find. The merge
  //      bug is not worked around at 0 — it is never reached.
  //    ⚠ WHAT 3 COST, and why this is a fix rather than a preference: a wall-THICKNESS census
  //      (floor | N solid | floor, every row AND column — the instrument `band` structurally cannot
  //      be, since band only ever sees N = 1) measured N = 3 or 4 in FORTY-NINE places against
  //      N = 1 or 2 in four. Mark had been reporting it for days in the only words he could see it
  //      in — "some walls are underground in squares", "the hallway is totally messed up squares and
  //      hidden" — and it read as a RENDER complaint until the census named it as a GEOMETRY fact.
  //      The 3x4 block at x49-51 z42-45 is the one he finally pointed at, via (52,42).
  //    ⚠ 1 IS STILL ILLEGAL AND 2 IS STILL THE MERGE. Going to 0 does not soften either — this
  //      file's own band self-check still throws on a 1-tile wall with floor on both sides, and
  //      nothing here may be "trimmed" from 0 back up to 1 or 2.
  //    ⚠ ROOM-TO-CORRIDOR STAYS AT ZERO — rooms TOUCH their corridor and the doorway is an edge tile
  //      of the room. A seam is not a wall and produces no orphan; section 0 is the proof.
  // ⛔ SUPERSEDED 2026-09-07 — ALL THREE WINGS RE-AUTHORED. Mark 2026-09-05: "halls max 10 (usually
  //    4-5), rooms on the main hall", and 2026-09-07 on the map: "its probably why the map looks
  //    clunky", then "we now create an even better map system with all the trimmings".
  //    WHAT WAS HERE: each wing was a 1-tile-wide spine running the FULL DEPTH of its wing — H1x16,
  //    three of them (ids 10, 16, 22) — with four rooms hung down its length. MAP_CENSUS found all
  //    three on the first floor that ever booted with sections turned on.
  //    ⚠ SHORTENING THE SPINE ALONE WAS NOT POSSIBLE, and this is the measurement that settles it:
  //      the old cafeteria's four doors sat at z49, z51, z60 and z61 — THIRTEEN tiles of spine are
  //      load-bearing, so even H1x10, the legal ceiling, is three tiles short of the room layout it
  //      was carrying. Every compliant version therefore MOVES ROOMS. It is a redesign, not a number.
  //    THE NEW SHAPE, one sentence: a compliant H2x6 spur off the ring/trunk, then ONE H1x10 main
  //    hall, with two rooms on its long sides and one at each END of it — 4 rooms, 4 doors, longest
  //    hallway 10. The end-cap rooms are what buy back the frontage the old 16-tile spine was using.
  //    ⚠ ROOM-TO-ROOM ROCK IS 3 TILES EVERYWHERE (the merge rule stated at the head of this block);
  //      room-to-corridor stays 0 — every room TOUCHES its hall and its doorway is an edge tile of
  //      the room. Both were checked per column and per row against the band self-check below, which
  //      throws on a 1-tile wall with floor on both sides.
  // ── SECTION 1 CASTLE A/B — reversible, scoped, and deliberately NOT a second generator ──────
  //
  // A is the shipping West Cafeteria control. B keeps its semantic special (`isCafeteria`, id 11),
  // IDs 9–14, the two-tile West section gate, and one H1x10 rōka, but replaces its straight spur
  // with a compact 90° masugata court. This is the first live projection of the seeded CastlePlan
  // vocabulary, not a claim that floor 1 is already seed-randomized. The actual seed/catalog adapter
  // remains a later migration; making an A/B experiment pretend to be that adapter would make saves
  // and replay evidence dishonest.
  //
  // Select B before generation with one of:
  //   window._section1CastleAB = 'B'                    (automation / a one-run developer override)
  //   ?section1Castle=B                                  (direct Engine9 or shell URL)
  // A (the default) is the control. Any unknown explicit value reports centrally to Oni-Baba and
  // safely falls back to A; no player-facing layout is silently guessed.
  const SECTION_1_CONTROL_A = {
    s: 1, dir: 'WEST', host: 'ring', gateSide: 'w', gate: [[47, 57], [47, 58]], link: [[44, 57]],   // the spur's top-left tile onto the hall's east end [REF#DG-02092]
    roomType: 'cafeteria', flag: 'isCafeteria', ja: '食堂', en: 'Cafeteria',
    castleAB: 'A', castleTemplateId: 'SECTION1_CURRENT_CONTROL',
    // ⛔ SUPERSEDED 2026-09-13 by Mark: "room for workers are 2x too big, they need smaller rooms. hallways to get to [REF#DG-02034]
    //    those rooms are 2x too long" — the 09-07 shape (H2x6 spur + H1x10 spine, worker rooms 16-21 tiles) is dead.
    //    Spur 3 long, spine 6, worker rooms 12-15 tiles; the special keeps its 8x7. Every room either touches its
    //    neighbour on a seam or stands 3 rock clear (R-209: no 2-tile gutter) — checked offline before it was written.
    // ⛔ SUPERSEDED 2026-09-19 by Mark: "ITS LIKE ALL ROOMS JUST JAMMED INTO ONE TINY SECTION ... EACH OF THESE SECTIONS
    //    SHOULD HAVE 8-12 ROOMS, NOT ALL ARE FILLED WITH ANYTHING. JUST SPREAD THINGS OUT ... ONE ATTACK AND THE ENTIRE
    //    SECTION FIGHTS" and "CENTER SPECIAL ROOM AT THE VERY LEFT". The 09-13 shrink (spur 3, spine 6, four rooms glued
    //    to the ring) is dead. The wing is now a 2-wide main hall running WEST off the spur with the special capping its
    //    far end, centred on the hall, plus two 1-wide branch halls; every worker room stands 3 rock from its neighbour
    //    (R-209) or meets it on a seam. Four of the eight rooms are vacant on purpose. Checked with gate:sec0 + bands.
    // ⛔ SUPERSEDED 2026-09-19 by Mark: "REDESIGN ALL THAT AND YOU HAVE FULL EDITOR/ARCHITECTURE RIGHTS" — the branch halls
    //    and rock-gapped boxes of the morning are dead. Each wing is now ONE STREET: a 2-wide main hall with rooms lining
    //    both sides seam to seam like a real corridor, the special capping the far end centred on the hall, and one room
    //    on each side of the spur. Nine rooms, four named, five vacant. The hall stands one row off the spur so the link
    //    seam keeps a wall line (Creator doorway-line). Deep doc: plans/UNDERWORLD_CASTLE_MASTER_PLAN_2026-09-19.md (Part 0.3
    //    geometry laws, Part 3 task cards) — the street shape, its laws and every follow-up card live there.
    cors: [{ id: 9,  x: 44, z: 57, w: 3,  h: 2,  key: 'H2x3' },
           { id: 10, x: 34, z: 55, w: 10, h: 3,  shapeKey: null, ja: '西大廊下', en: 'West Main Hall',
             // A-1 09-19 mid-street plaza: 2-wide near/far, 3-wide middle 4 tiles (lantern court), same [REF#DG-02097]
             // pattern as RING_BOX (un-keyed multi-rect hallway) [REF#DG-02097]
             parts: [{ x: 34, z: 56, w: 3, h: 2 }, { x: 37, z: 55, w: 4, h: 3 }, { x: 41, z: 56, w: 3, h: 2 }] }],
    rooms: [{ id: 11, x: 26, z: 53, w: 8, h: 7, door: [33, 56], key: 'R8x7', ja: '食堂',   en: 'Cafeteria' },   // caps the west end [REF#DG-02093]
            { id: 12, x: 34, z: 58, w: 3, h: 3, door: [35, 58], key: 'R3x3', ja: '配膳室', en: 'Pantry' },       // beside the 食堂 [REF#DG-02094]
            { id: 13, x: 37, z: 52, w: 4, h: 3, door: [38, 54], key: 'R4x3', ja: '米蔵',   en: 'Rice Store' },   // shrunk 1 row for A-1 plaza [REF#DG-02097]
            { id: 14, x: 44, z: 59, w: 4, h: 3, door: [45, 59], key: 'R4x3', ja: '井戸端', en: 'Well Room', hallId: 9 },   // south of the spur [REF#DG-02095]
            { id: 30, x: 34, z: 52, w: 3, h: 4, door: [35, 55], key: 'R3x4', ja: '空室',   en: 'Vacant Room' },
            { id: 31, x: 41, z: 52, w: 3, h: 4, door: [42, 55], key: 'R3x4', ja: '空室',   en: 'Vacant Room' },
            { id: 32, x: 44, z: 52, w: 4, h: 5, door: [44, 56], key: 'R4x5', ja: '空室',   en: 'Vacant Room', fixed: true },   // north of the spur, on the ring — not a street room, the roller keeps it [REF#DG-02096]
            { id: 33, x: 37, z: 58, w: 4, h: 3, door: [38, 58], key: 'R4x3', ja: '空室',   en: 'Vacant Room' },
            { id: 34, x: 41, z: 58, w: 3, h: 3, door: [42, 58], key: 'R3x3', ja: '空室',   en: 'Vacant Room' }]
  };

  function reportSection1CastleABFault(reason) {
    const payload = { type: 'ANOMALY_REPORT', code: 'section1_castle_ab',
      msg: 'Section 1 castle compiler: ' + String(reason).slice(0, 220) };
    if (global.parent && typeof global.parent.postMessage === 'function') global.parent.postMessage(payload, '*');
    else if (typeof global.postMessage === 'function') global.postMessage(payload, '*');
    else console.warn(payload.msg);
  }

  function section1ABSelection() {
    let raw = global._section1CastleAB;
    if (raw == null) {
      try {
        raw = new URLSearchParams(global.location?.search || '').get('section1Castle');
        if (raw == null && global.parent && global.parent !== global)
          raw = new URLSearchParams(global.parent.location.search || '').get('section1Castle');
      } catch (error) { reportSection1CastleABFault(error.message); }
    }
    if (raw == null || raw === '' || String(raw).toUpperCase() === 'A') return 'A';
    if (String(raw).toUpperCase() === 'B') return 'B';
    reportSection1CastleABFault('Unknown A/B value; using A');
    return 'A';
  }

  const SECS = [
    // ⛔ SUPERSEDED 2026-09-19 by Mark: "REDESIGN ALL THAT AND YOU HAVE FULL EDITOR/ARCHITECTURE RIGHTS" — same street [REF#DG-02097]
    //    shape as the west wing (see SECTION_1_CONTROL_A): 2-wide main hall, rooms seam to seam on both sides, the
    //    special centred on the far end, one room each side of the spur. Nine rooms per wing, four named, five vacant.
    //    Deep doc: plans/UNDERWORLD_CASTLE_MASTER_PLAN_2026-09-19.md.
    // ── NORTH · 工場 wing ── the street runs NORTH off the spur, 工場 caps the top. ────────────────────────────────────
    { s: 2, dir: 'NORTH', host: 'ring', gateSide: 'n', gate: [[52, 49], [53, 49]], link: [[53, 46]],
      roomType: 'factory', flag: 'isFactory', ja: '工場', en: 'Factory',
      cors: [{ id: 15, x: 52, z: 46, w: 2,  h: 3, key: 'H2x3' },
             { id: 16, x: 53, z: 36, w: 2,  h: 10, key: 'H2x10', ja: '北大廊下', en: 'North Main Hall' }],
      rooms: [{ id: 17, x: 50, z: 29, w: 8, h: 7, door: [53, 35], key: 'R8x7', ja: '工場',   en: 'Factory' },     // caps the north end [REF#DG-02098]
              { id: 18, x: 55, z: 36, w: 3, h: 3, door: [55, 37], key: 'R3x3', ja: '鋳造室', en: 'Foundry' },
              { id: 19, x: 50, z: 36, w: 3, h: 3, door: [52, 37], key: 'R3x3', ja: '部品庫', en: 'Parts Store' },
              { id: 20, x: 48, z: 46, w: 4, h: 4, door: [51, 47], key: 'R4x4', ja: '作業場', en: 'Workshop', hallId: 15 },   // west of the spur [REF#DG-02099]
              { id: 35, x: 55, z: 39, w: 3, h: 3, door: [55, 40], key: 'R3x3', ja: '空室',   en: 'Vacant Room' },
              { id: 36, x: 55, z: 42, w: 3, h: 4, door: [55, 43], key: 'R3x4', ja: '空室',   en: 'Vacant Room' },
              { id: 37, x: 54, z: 46, w: 4, h: 4, door: [54, 47], key: 'R4x4', ja: '空室',   en: 'Vacant Room', hallId: 15 },   // east of the spur, on the ring [REF#DG-02100]
              { id: 38, x: 50, z: 39, w: 3, h: 3, door: [52, 40], key: 'R3x3', ja: '空室',   en: 'Vacant Room' },
              { id: 39, x: 50, z: 42, w: 3, h: 4, door: [52, 43], key: 'R3x4', ja: '空室',   en: 'Vacant Room' }] },
    // ── EAST · 倉庫 wing ── hangs off the East Passage; the street runs EAST, 倉庫 caps the far end. ──────────────────── [REF#DG-02101]
    { s: 3, dir: 'EAST', host: 'easthall', gateSide: 'e', gate: [[70, 60], [70, 61]], link: [[73, 60]],
      // ⛔ SUPERSEDED 2026-09-03 by Mark: "section 3 should have storage, put it back ... use [REF#DG-01389]
      //    warehouse, i dont fucking care its same fucking building" — this wing IS the storage: `isStorage`/`_storageRoomId`
      //    resolve to room 23 and the 番所 stays purely the guard house.
      roomType: 'storage', flag: 'isStorage', ja: '倉庫', en: 'Warehouse',
      cors: [{ id: 21, x: 71, z: 60, w: 3,  h: 2,  key: 'H2x3' },
             { id: 22, x: 74, z: 59, w: 10, h: 2,  key: 'H2x10', ja: '東大廊下', en: 'East Main Hall' }],
      rooms: [{ id: 23, x: 84, z: 57, w: 8, h: 6, door: [84, 59], key: 'R8x6', ja: '倉庫',     en: 'Warehouse' },   // caps the east end [REF#DG-02102]
              { id: 24, x: 74, z: 61, w: 3, h: 3, door: [75, 61], key: 'R3x3', ja: '荷捌き場', en: 'Loading Bay' },
              { id: 25, x: 74, z: 56, w: 3, h: 3, door: [75, 58], key: 'R3x3', ja: '木箱置場', en: 'Crate Yard' },
              { id: 26, x: 81, z: 61, w: 3, h: 3, door: [82, 61], key: 'R3x3', ja: '古道具庫', en: 'Junk Store' },   // on the 倉庫 seam [REF#DG-02103]
              { id: 40, x: 77, z: 56, w: 4, h: 3, door: [78, 58], key: 'R4x3', ja: '空室',     en: 'Vacant Room' },
              { id: 41, x: 81, z: 56, w: 3, h: 3, door: [82, 58], key: 'R3x3', ja: '空室',     en: 'Vacant Room' },
              { id: 42, x: 71, z: 57, w: 3, h: 3, door: [72, 59], key: 'R3x3', ja: '空室',     en: 'Vacant Room', hallId: 21 },   // north of the spur [REF#DG-02104]
              { id: 43, x: 77, z: 61, w: 4, h: 3, door: [78, 61], key: 'R4x3', ja: '空室',     en: 'Vacant Room' },
              { id: 44, x: 71, z: 62, w: 3, h: 3, door: [72, 62], key: 'R3x3', ja: '空室',     en: 'Vacant Room', hallId: 21 }] },  // south of the spur [REF#DG-02105 → see REF#DG-02095]
  ];

  // ⛔ SUPERSEDED 2026-09-13 by Mark: "have player start on stairway - so one step forward will feel like walking down [REF#DG-02055]
  //    to start the floor." — the spawn was one row above the stairs (z 72); it is now ON the left stairs_up tile
  //    (z 73, the flight's high end), so the first step north walks down the flight into the hall. The engine's
  //    exit/ascend prompts wait until the player has left the flight once (`_stairsLeftOnce`, Engine9), so the
  //    arrival does not ask "exit?" on frame one. RESTORE the row-above spawn: window._spawnOnStairs = false.
  // ── THE STREET ROLLS ON THE RUN SEED (Mark 2026-09-21: "monster spawns and room generation seems stale and static -
  //    needs to be rebuilt correctly with new monsters and loot spawns randomly EACH GAME LOAD") ─────────────────────
  //    Until today every wing room above was literal {x,z,w,h,door} data, so a fresh seed (the shell mints one every
  //    load since 389cad62) changed the staff KINDS and nothing the player could see: same rooms, same doors, same posts.
  //    Now each wing's STREET rooms — the ones lining the main hall — are re-rolled from the seed: how many rooms each
  //    side of the hall holds (2-3), how long each is (3-6 tiles, seam to seam, R-209 no gutter), how deep (3-4 where
  //    the authored band allows), where each door sits, and which of them carry the wing's named roles (Foundry, Crate
  //    Yard …) vs. stand vacant. What does NOT roll, because it is law or geometry: the head (rooms 0-8, 27-29, R-210),
  //    every spur/gate/link tile, the special capping the far end (rooms[0], DG-01297), the two rooms beside the spur
  //    (hallId / fixed) and the bands the street rooms may occupy (exactly the tiles the authored rooms sat on, so no
  //    new collision with the ring or a neighbouring wing is possible). Staff posts, wing orcs and hall loot already
  //    roll per room on the seed, so they follow the rooms. Ids are re-packed contiguous (9-26, then 30+) because the
  //    engine asserts rooms[i].id === i; nothing downstream keys a wing room by number (grepped 09-21) — the special
  //    is found as rooms[0] and its flag, vacancies by en === 'Vacant Room'. Castle B (section 1 A/B) is left as
  //    compiled: its verify() reads ids. BACK: global._floor1RollWings = false restores the authored data, ids included.
  //    Offline check: node — require Creator + Section0, call generateDungeonMap(1,160,160,{layoutSeed}) per seed.
  const BANDS = {   // per section: the street bands, exactly where the authored street rooms stood [REF#DG-02120]
    1: [{ side: 'N', along: [34, 43], far: 52 }, { side: 'S', along: [34, 43], far: 60 }],
    2: [{ side: 'W', along: [36, 45], far: 50 }, { side: 'E', along: [36, 45], far: 57 }],
    3: [{ side: 'N', along: [74, 83], far: 56 }, { side: 'S', along: [74, 83], far: 63 }],
  };
  function rollWings(secsOn, seedStr) {
    if (global._floor1RollWings === false) return secsOn;
    let rs = ((parseInt(String(seedStr), 10) >>> 0) ^ 0x5EC70001) >>> 0; if (!rs) rs = 0x9E3779B1;
    const rng = () => { rs = (Math.imul(rs ^ (rs >>> 15), 0x2c1b3c6d) >>> 0); rs = (rs ^ (rs >>> 12)) >>> 0; return (rs & 0xffffff) / 0x1000000; };
    const pick = (arr, w) => { let t = 0; for (let i = 0; i < arr.length; i++) t += (w ? w[i] : 1); let r = rng() * t; for (let i = 0; i < arr.length; i++) { r -= (w ? w[i] : 1); if (r < 0) return arr[i]; } return arr[arr.length - 1]; };
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const out = secsOn.map(S => (S.castleAB === 'B' || !BANDS[S.s]) ? S : JSON.parse(JSON.stringify(S)));
    if (out.some(S => S.castleAB === 'B')) return secsOn;              // castle verify reads ids — leave the whole floor authored [REF#DG-02121]
    const log = [];
    for (const S of out) {
      const bands = BANDS[S.s]; if (!bands) continue;
      const H = S.cors[1]; const parts = H.parts || [H];
      // Mark 2026-10-12: section halls stay two tiles wide, including the west hall's middle. [REF#DG-02329]
      if (S.s === 1) { H.z = 56; H.h = 2; H.key = 'H2x10'; delete H.parts; parts.splice(0, parts.length, H); }
      const hall = new Set(); for (const p of parts) for (let x = p.x; x < p.x + p.w; x++) for (let z = p.z; z < p.z + p.h; z++) hall.add(x + ',' + z);
      const keep = S.rooms.filter((R, i) => i === 0 || R.fixed || Number.isInteger(R.hallId));
      const names = shuffle(S.rooms.filter(R => !keep.includes(R) && R.en !== 'Vacant Room').map(R => ({ ja: R.ja, en: R.en })));
      const rolled = [];
      for (const B of bands) {
        const horiz = (B.side === 'N' || B.side === 'S');
        // the hall tile a street tile faces, per column/row along the band (undefined = no hall there) [REF#DG-02122]
        const edge = (a) => { let best; for (let k = 0; k < 160; k++) { const key = horiz ? (a + ',' + k) : (k + ',' + a); if (!hall.has(key)) continue; best = (best === undefined) ? k : ((B.side === 'N' || B.side === 'W') ? Math.min(best, k) : Math.max(best, k)); } return best; };
        // split the band where the hall edge changes (section 1's plaza) so every room meets the hall flush [REF#DG-02123]
        const subs = []; let a = B.along[0];
        while (a <= B.along[1]) { const e = edge(a); let b = a; while (b + 1 <= B.along[1] && edge(b + 1) === e) b++; if (e !== undefined) subs.push({ a0: a, a1: b, e }); a = b + 1; }
        for (const sub of subs) {
          let rem = sub.a1 - sub.a0 + 1, at = sub.a0;
          while (rem >= 3) {
            const opts = [3, 4, 5, 6].filter(l => l <= rem && (rem - l === 0 || rem - l >= 3));
            const len = pick(opts, opts.map(l => ({ 3: 4, 4: 3, 5: 2, 6: 1 })[l]));
            const near = (B.side === 'N' || B.side === 'W') ? sub.e - 1 : sub.e + 1;
            const avail = Math.abs(B.far - near) + 1;
            const d = pick([3, 4].filter(v => v <= avail), [3, 2]);
            const lo = Math.min(near, (B.side === 'N' || B.side === 'W') ? near - d + 1 : near + d - 1);
            const R = horiz ? { x: at, z: lo, w: len, h: d } : { x: lo, z: at, w: d, h: len };
            const da = at + Math.floor(rng() * len);
            R.door = horiz ? [da, near] : [near, da];
            R.key = 'R' + R.w + 'x' + R.h; R.rolled = true;
            rolled.push(R); at += len; rem -= len;
          }
        }
      }
      shuffle(rolled);
      rolled.forEach((R, i) => { const n = names[i]; R.ja = n ? n.ja : '空室'; R.en = n ? n.en : 'Vacant Room'; });
      S.rooms = keep.concat(rolled.sort((p, q) => (p.z - q.z) || (p.x - q.x)));
      // Mark 2026-10-12: meet the Section 0 spoke flush, then either continue straight [REF#DG-02330]
      // or make one full-width right-angle turn. Move the street rooms and end room
      // rigidly with their hall so their doors remain on the same edge tiles.
      const bent = rng() < 0.5;
      const move = (x, z) => {
        if (S.s === 1) { z += 1; return bent ? [37 + z - 57, 56 - (43 - x)] : [x, z]; }
        if (S.s === 2) { x -= 1; return bent ? [54 + 45 - z, 39 + x - 52] : [x, z]; }
        z += 1; return bent ? [79 + z - 60, 62 + x - 74] : [x, z];
      };
      for (const R of [H, ...S.rooms.filter((R, i) => i === 0 || (!R.fixed && !Number.isInteger(R.hallId)))]) {
        const a = move(R.x, R.z), b = move(R.x + R.w - 1, R.z + R.h - 1);
        if (R.door) R.door = move(...R.door);
        R.x = Math.min(a[0], b[0]); R.z = Math.min(a[1], b[1]);
        R.w = Math.abs(a[0] - b[0]) + 1; R.h = Math.abs(a[1] - b[1]) + 1;
        // Rectangle dimensions, rather than an orientation-specific template, own the footprint. [REF#DG-02331]
        R.key = R === H ? null : 'R' + R.w + 'x' + R.h; R.shapeKey = R.key;
      }
      const spur = S.cors[0];
      if (S.s === 1) {
        if (bent) { spur.x = 37; spur.w = 10; }
        S.link = bent ? [[37, 57], [38, 57]] : [[44, 57], [44, 58]];
        S.linkSide = bent ? 'n' : 'w';
      } else if (S.s === 2) {
        if (bent) { spur.z = 39; spur.h = 10; }
        S.link = bent ? [[53, 39], [53, 40]] : [[52, 46], [53, 46]];
        S.linkSide = bent ? 'e' : 'n';
      } else {
        if (bent) spur.w = 10;
        S.link = bent ? [[79, 61], [80, 61]] : [[73, 60], [73, 61]];
        S.linkSide = bent ? 's' : 'e';
      }
      spur.key = null; spur.shapeKey = null;
      // Restore single-tile room doors, fitted to the unchanged hallway edge. [REF#DG-02332]
      for (const R of S.rooms) {
        const candidates = [];
        for (const C of S.cors) {
          const contains = (x, z) => (C.parts || [C]).some(p => x >= p.x && x < p.x + p.w && z >= p.z && z < p.z + p.h);
          for (const [side, dx, dz] of [['w', -1, 0], ['e', 1, 0], ['n', 0, -1], ['s', 0, 1]]) {
            for (let i = 0; i < (dx ? R.h : R.w); i++) {
              const x = dx ? R.x + (dx > 0 ? R.w - 1 : 0) : R.x + i;
              const z = dz ? R.z + (dz > 0 ? R.h - 1 : 0) : R.z + i;
              if (contains(x + dx, z + dz)) candidates.push({x, z, hallId:C.id, distance:Math.hypot(x-R.door[0], z-R.door[1])});
            }
          }
        }
        candidates.sort((a,b) => a.distance-b.distance);
        if (!candidates.length) throw new Error('Section0: no hallway edge for room ' + R.id);
        const d = candidates[0]; R.door = [d.x, d.z]; R.hallId = d.hallId;
      }
      log.push(S.en + ': ' + rolled.length + ' street rooms (' + rolled.map(R => R.w + 'x' + R.h).join(',') + ')');
    }
    // re-pack ids: 9-26 then 30+ (0-8 and 27-29 are the head), remapping every id-carrying reference [REF#DG-02124]
    const free = []; for (let i = 9; i <= 26; i++) free.push(i); let next = 30;
    const take = () => free.length ? free.shift() : next++;
    const remap = new Map();
    for (const S of out) for (const list of [S.cors, S.rooms]) for (const R of list) { const id = take(); if (R.id !== undefined) remap.set(R.id, id); R._oldId = R.id; R.id = id; }
    for (const S of out) {
      for (const R of S.rooms) if (Number.isInteger(R.hallId)) R.hallId = remap.get(R.hallId) ?? R.hallId;
      for (const d of S.extraDoors || []) { d.owner = remap.get(d.owner) ?? d.owner; d.to = remap.get(d.to) ?? d.to; }
    }
    try { console.log('[STREET] wings rolled on seed ' + seedStr + ' — ' + log.join(' · ') + '. Off: global._floor1RollWings=false'); } catch (_) {}
    return out;
  }

  const SPAWN  = { x: 57, z: 72 };   // Mark 2026-10-20: start on the landing at the foot of the stairs. [REF#DG-01250]

  function generateDungeonMap(level, MAP_W, MAP_H, castle = {}) {
    const C = global.Creator;
    if (!C) throw new Error('Section0: Creator.js is not loaded — this map does not exist without it');
    C.reset();
    // ⛔ SUPERSEDED 2026-09-07 by Mark, live in chat: told directly sections were missing, then: "this is [REF#DG-01473]
    // insane, i told you what was needed, do it, override everything make it happen." Default flipped —
    // the 2026-09-05 minimal cut ("just the hallway + guard room... section 0 again, see what it looks
    // like") was itself always meant as a look, not a permanent floor plan, and has now been overruled
    // in the other direction: sections 1-3 build UNLESS explicitly opted into minimal mode. BACK:
    // window._floor1Minimal = true restores the minimal cut exactly as it was.
    const MINIMAL = (global._floor1Minimal === true);   // sections 1-3 build by default; minimal cut is now opt-in [REF#DG-01474]
    let SECTION_1 = SECTION_1_CONTROL_A;
    let castleProof = null;
    if (!MINIMAL && !castle.control && section1ABSelection() === 'B') {
      try {
        if (typeof castle.compile !== 'function' || typeof castle.verify !== 'function') throw new Error('Shogun compiler not loaded');
        if (castle.layoutSeed == null) throw new Error('Section 1 requires the engine floor seed');
        SECTION_1 = castle.compile({ layoutSeed: String(castle.layoutSeed), floor: level });
      } catch (error) { reportSection1CastleABFault(error.message); }
    }
    // The experiment replaces precisely one entry; sections 2–4 remain the shipping data objects. [REF#DG-01475]
    // Resolving here (rather than at script load) lets a boot/init harness select A or B before the
    // floor is authored, without creating a second map loop or mutable generation stream.
    const SECS_ON = rollWings(MINIMAL ? [] : [SECTION_1].concat(SECS),   // sections 1-3 are not placed in the minimal cut [REF#DG-01476]
      (castle.layoutSeed != null) ? castle.layoutSeed : (global._origamiGameSeed ?? global._mapSeed ?? 0));   // the street rolls on the run seed (09-21) [REF#DG-02096]
    try {
      global._section1CastleABActive = SECTION_1.castleAB;
      global._section1CastleTemplateId = SECTION_1.castleTemplateId;
    } catch (err) {
      reportSection1CastleABFault('could not publish active variant: ' + (err && err.message || err));
    }
    const CORR = MINIMAL ? STRIP_BOX : SPINE;             // the corridor record: backstage L (minimal) or the plaza [REF#DG-01477]

    // ── 1. AUTHOR ───────────────────────────────────────────────────────────────────────────── [REF#DG-01251]
    const hall     = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'hallway', genId: HALL.id,  x: HALL.x,  z: HALL.z,  w: HALL.w,  h: HALL.h });
    const cabaret  = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'room',    genId: CAB.id,   x: CAB.x,   z: CAB.z,   w: CAB.w,   h: CAB.h });
    const spine    = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'hallway', genId: CORR.id,  x: CORR.x,  z: CORR.z,  w: CORR.w,  h: CORR.h });
    const dress    = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'room',    genId: DRESS.id, x: DRESS.x, z: DRESS.z, w: DRESS.w, h: DRESS.h });
    const mgr      = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'room',    genId: MGR.id,   x: MGR.x,   z: MGR.z,   w: MGR.w,   h: MGR.h });
    const ring     = C.createRoom({ shapeKey: null, segmentId: 0, kind: 'hallway', genId: RING_ID,  x: RING_BOX.x, z: RING_BOX.z, w: RING_BOX.w, h: RING_BOX.h });
    // ── THE 番所 IS SECTION 4, NOT SECTION 0 (Mark 2026-09-03) ─────────────────────────────── [REF#DG-01235]
    //    ⛔ SUPERSEDED 2026-10-10 by Mark: "Unlock guard room - its no longer a section - it is part of Section 0." The
    //    guard room was section 0's — part of the core the player walks into — and it is now the
    //    section the other three unlock. `Creator.SPECIAL_BUILDING[4] = 'guard'` is the other half of
    //    this: section 4 must CONTAIN a room of type 'guard', and this is that room.
    //    ⚠ FOUR WRITERS MOVE TOGETHER OR THE ROOM SPLITS IN TWO. `assignAddresses` reads a room's
    //      section as the SET of segmentIds on its tiles, so one tile left on 0 addresses the 番所 as
    //      the connector "0+4" — a key `validateSections` counts as a room spanning sections and NOT
    //      as a section, leaving section 4 with zero rooms. The four: this createRoom, `_secOf`
    //      below (which stamps the tiles), the stairs_down tile written AFTER that stamp, and the
    //      room record. Miss the stairs tile and the room reads "0+4".
    //    ⛔ SUPERSEDED 2026-10-10 by Mark: "Unlock guard room - its no longer a section - it is part of Section 0."
    //    Superseded 2026-10-12: Mark approved the bath wing as static Section 0 too.
    const _guardSec = 0;
    const _bathSec = 0;
    const guard    = C.createRoom({ shapeKey: null, segmentId: _guardSec, kind: 'room',    genId: GUARD.id, x: GUARD.x, z: GUARD.z, w: GUARD.w, h: GUARD.h });
    // `special: true` — the bath footprint is authored, and Mark 2026-09-08 ruled room-shape has no [REF#DG-01720]
    // jurisdiction over a special's size. Every other Creator rule still grades it.
    const bath     = MINIMAL ? null : C.createRoom({ shapeKey: null, special: true, segmentId: _bathSec, kind: 'room', genId: BATH.id, x: BATH.x, z: BATH.z, w: BATH.w, h: BATH.h });
    const bhall    = MINIMAL ? null : C.createRoom({ shapeKey: null, segmentId: _bathSec, kind: 'hallway', genId: BHALL.id, x: BHALL.x, z: BHALL.z, w: BHALL.w, h: BHALL.h });
    const easthall = MINIMAL ? null : C.createRoom({ shapeKey: null, segmentId: 0, kind: 'hallway', genId: EASTHALL.id, x: EASTHALL.x, z: EASTHALL.z, w: EASTHALL.w, h: EASTHALL.h });

    const officeE = MINIMAL ? null : C.createRoom({ shapeKey: 'R4x3', segmentId: 0, kind: 'room', genId: OFFICE_E.id, x: OFFICE_E.x, z: OFFICE_E.z, w: OFFICE_E.w, h: OFFICE_E.h });
    const storeE  = MINIMAL ? null : C.createRoom({ shapeKey: 'R' + STORE_E.w + 'x' + STORE_E.h, segmentId: 0, kind: 'room', genId: STORE_E.id,  x: STORE_E.x,  z: STORE_E.z,  w: STORE_E.w,  h: STORE_E.h });
    const secRooms = SECS_ON.map(S => ({
      S,
      rooms: S.rooms.filter(R=>R.id<27).map(R => ({ R, cr: C.createRoom({ shapeKey: R.key, segmentId: S.s, kind: 'room',    genId: R.id, x: R.x, z: R.z, w: R.w, h: R.h }) })),
      cors:  S.cors.filter(Cx=>Cx.id<27).map(Cx => ({ Cx, cr: C.createRoom({ shapeKey: Cx.key, segmentId: S.s, kind: 'hallway', genId: Cx.id, x: Cx.x, z: Cx.z, w: Cx.w, h: Cx.h }) })),
    }));
    // Allocate demo additions last so Creator's existing room IDs in the other sections also stay stable. [REF#DG-01479]
    for (const E of secRooms) {
      for (const R of E.S.rooms.filter(r=>r.id>=27)) E.rooms.push({R,cr:C.createRoom({shapeKey:R.key,
        segmentId:E.S.s,kind:'room',genId:R.id,x:R.x,z:R.z,w:R.w,h:R.h})});
      for (const Cx of E.S.cors.filter(r=>r.id>=27)) E.cors.push({Cx,cr:C.createRoom({shapeKey:Cx.key,
        segmentId:E.S.s,kind:'hallway',genId:Cx.id,x:Cx.x,z:Cx.z,w:Cx.w,h:Cx.h})});
    }

    C.createDoor({ roomId: cabaret.roomId, connects: [cabaret.roomId, ring.roomId],  side: 's', span: 2, theme: 'cabaret', tiles: CSOUTH });
    C.createDoor({ roomId: cabaret.roomId, connects: [cabaret.roomId, ring.roomId],  side: 'e', span: 2, theme: 'cabaret', tiles: CEAST });
    C.createDoor({ roomId: cabaret.roomId, connects: [cabaret.roomId, spine.roomId], side: 'w', span: 1, theme: 'cabaret', tiles: [CWEST] });
    // (the 楽屋 / 支配人室 north doors were declared here until 2026-09-30 — see the note where DDOOR / MDOOR stood) [REF#DG-02126]
    C.createDoor({ roomId: guard.roomId,   connects: [guard.roomId, ring.roomId],    side: 'n', span: 1, theme: null,      tiles: [GDOOR] });
    if (bhall) C.createDoor({ roomId: bhall.roomId, connects: [bhall.roomId, guard.roomId], side: 'w', span: 2, theme: null, tiles: BATH_WING.guardDoor });
    C.createDoor({ roomId: hall.roomId,    connects: [hall.roomId, ring.roomId],     side: 'n', span: 2, theme: null,      tiles: GATE });
    if (!MINIMAL) {
    C.createDoor({ roomId: easthall.roomId, connects: [easthall.roomId, ring.roomId], side: 'w', span: 2, theme: null,    tiles: EHDOOR });
    // The east passage's far column was already flagged `sectionExit = 1`. This is the join it named. [REF#DG-01315]
    C.createDoor({ roomId: officeE.roomId, connects: [officeE.roomId, easthall.roomId], side: 's', span: 1, theme: null, tiles: [ODOOR] });
    C.createDoor({ roomId: storeE.roomId,  connects: [storeE.roomId,  easthall.roomId], side: 'n', span: 1, theme: null, tiles: [SDOOR] });
    }
    for (const E of secRooms) {
      // Two doors per section: host→spur (this is the SECTION GATE) and spur→special room. [REF#DG-01316]
      // `host` is the east trunk for sections 1-4 and the RING — the hall surrounding section 0 —
      // for the west and north sections. The sides are declared per section rather than derived from
      // the index: the first version keyed them off `s <= 2`, which happened to be right for four
      // east sections and would have been silently wrong the moment one hung off a different leg.
      const host = E.S.host === 'ring' ? ring : easthall;   // 'easthall' since 2026-09-13 — the trunk is gone [REF#DG-02053]
      const spur = E.cors[0].cr;
      C.createDoor({ roomId: spur.roomId, connects: [spur.roomId, host.roomId], side: E.S.gateSide, span: E.S.gate.length, theme: null, tiles: E.S.gate,
        sectionDoorRole: 'gate', sectionDoorKey: 'section:' + E.S.s + ':gate', sectionIndex: E.S.s });
      const _dist0 = E.cors[1].cr;
      C.createDoor({ roomId: spur.roomId, connects: [spur.roomId, _dist0.roomId], side: E.S.linkSide || null, span: E.S.link.length, theme: null, tiles: E.S.link,
        sectionDoorRole: 'hub', sectionDoorKey: 'section:' + E.S.s + ':hub', sectionIndex: E.S.s });
      // One door per ROOM onto the distribution corridor. The doorway is an EDGE TILE OF THE ROOM [REF#DG-01317]
      // because the room touches the corridor — the same shape as the 番所's door at (61,66), not a
      // tile carved out of a gap between them.
      const dist = E.cors[1].cr;
      for (const RR of E.rooms)
        C.createDoor({ roomId: RR.cr.roomId, connects: [RR.cr.roomId, E.cors.find(c => c.Cx.id === RR.R.hallId)?.cr.roomId || dist.roomId], side: null, span: 1, theme: null, tiles: [RR.R.door] });
      const creatorId = id => E.cors.find(c => c.Cx.id === id)?.cr.roomId || E.rooms.find(r => r.R.id === id)?.cr.roomId;
      for (const d of E.S.extraDoors || []) C.createDoor({ roomId: creatorId(d.owner),
        connects: [creatorId(d.owner), creatorId(d.to)], side:d.side, span:d.tiles.length, tiles:d.tiles });
    }

    // ── 2. STAMP ────────────────────────────────────────────────────────────────────────────── [REF#DG-01252]
    const map = [];
    for (let x = 0; x < MAP_W; x++) { map[x] = []; for (let z = 0; z < MAP_H; z++) map[x][z] = { type: 'wall' }; }
    const cell = (id) => ({ type: 'floor', roomId: id, segmentId: 0, room: true });
    const rect = (r, id) => { for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) map[x][z] = cell(id != null ? id : r.id); };
    for (const r of RING) rect(r, RING_ID);
    rect(DRESS); rect(MGR);
    if (MINIMAL) { rect(STRIP_ROW); rect(STRIP_COL); } else rect(SPINE);
    rect(CAB);
    // Two rock rows north of the stage wall. They span the whole corridor top (x50-60) in the plaza cut: with only x55-60 [REF#DG-02204]
    // carved, the leftover 西回廊 was a filled 5x9 — not a catalogue shape (Creator room-shape, measured 2026-09-24) — and a
    // one-row carve leaves a one-tile wall band between corridor and cabaret. 5x7 = R5x7. The minimal cut keeps its H1x8 row.
    for (let x = (MINIMAL ? CAB.x : SPINE.x); x < CAB.x + CAB.w; x++) for (let z = CAB.z - 2; z < CAB.z; z++) map[x][z] = { type: 'wall' };
    rect(HALL); rect(GUARD);
    if (!MINIMAL) { rect(BATH); for (const p of BHALL.parts) rect(p, BHALL.id); }
    if (!MINIMAL) { rect(EASTHALL); rect(OFFICE_E); rect(STORE_E); }
    for (const S of SECS_ON) { for (const R of S.rooms) rect(R); for (const Cx of S.cors)
      for (const part of Cx.parts || [Cx]) rect(part, Cx.id); }
    // the NORTHERN HALF of the shared wall is the COUNTER. rect(GUARD) has already laid this column [REF#DG-01253]
    // as 番所 floor; we only FLAG it, and Engine9 drops the seam pane beside it to 30%. Overwriting
    // it with a wall tile is what built the crate field.
    for (let z = COUNTER_COL.z0; z <= COUNTER_COL.z1; z++) {
      const _cc = map[COUNTER_COL.x][z];
      if (!_cc || _cc.type !== 'floor' || _cc.roomId !== GUARD.id)
        throw new Error('Section0: COUNTER seat ' + COUNTER_COL.x + ',' + z + ' is not 番所 floor');
      const _wst = map[COUNTER_COL.x - 1][z];
      if (!_wst || _wst.roomId !== HALL.id)
        throw new Error('Section0: COUNTER at ' + COUNTER_COL.x + ',' + z + ' does not face the hall');
      _cc.counterWall = true;
      // WHICH EDGE. The counter is the WEST seam only — the one it shares with the hall. Without [REF#DG-01254]
      // this the flag drops all four of the tile's edges to 30%, and the 番所's north wall becomes a
      // 2m waist-high stub onto the ring (measured 2026-08-31 as `seamRun:N:59-59:counter`).
      _cc.counterSide = 'W';
    }

    // The open junction that used to carry the 玄関口 approach into the ring is GONE with the [REF#DG-01255]
    // approach. The cabaret's own entrance doubles at (57,63)(58,63) ARE the join now, and they are
    // a real door with a DOOR_ID — not an unmarked opening. Nothing to flag here.

    const door = (t, id) => { map[t[0]][t[1]] = { type: 'shoji_door', roomId: id, segmentId: 0 }; };
    for (const d of GATE)   door(d, HALL.id);
    for (const d of CSOUTH) door(d, CAB.id);
    for (const d of CEAST)  door(d, CAB.id);
    door(CWEST, CAB.id);
    // the backstage door + passage (Mark 2026-09-27) — see NDOOR above [REF#DG-02211]
    door(NDOOR, CAB.id);
    Object.assign(map[NDOOR[0]][NDOOR[1]], { staff: 'manager' });   // the MANAGER'S OFFICE / AUTHORIZED PERSONNEL ONLY plaque hangs on this door's cabaret face; the Manager slams it (Mark 2026-09-28) [REF#PENDING] [REF#DG-02212]
    for (const t of BACKSTAGE) map[t[0]][t[1]] = cell(SPINE.id);
    door(DEAST, DRESS.id); door(MWEST, MGR.id);
    // MEASURED after the first cut: the adopt pass re-mints the passage's lower block as its own room and the wall builder panes the [REF#DG-02213]
    // seam at 56,54|56,55 — so the neck cell is a doorway of the west-corridor room, and the passage reads through
    door([56, 55], SPINE.id);
    Object.assign(map[DEAST[0]][DEAST[1]], { sign: '楽屋', signEn: 'DRESSING ROOM', lockedBy: 'dressing', locked: false });
    Object.assign(map[MWEST[0]][MWEST[1]], { sign: '支配人室', signEn: "MANAGER'S OFFICE", lockedBy: 'manager', locked: !MINIMAL });
    // THE BACKSTAGE PLAQUES (Mark 2026-09-20: "where is the authorized personnel sign on that door? managers office / [REF#DG-02115]
    // dressing rooms"). Engine9's `_backstageSign` builder (~:20651) draws "AUTHORIZED PERSONS ONLY" over the door of every
    // isManagerOffice / isDressingRoom room — but only where the door TILE carries `signEn`; it finds the sign from the
    // tile, not the room. DungeonChain's generator stamps that field via _lockedDoors; this hand-drawn floor never did, so
    // on floor 1 the builder found no tile and counted a skip (window._backstageSignSkipped). Same words as DungeonChain
    // :2826, unlocked — the sign is a notice, not a lock.
    // (2026-09-30: DDOOR is gone; DEAST, above, carries the dressing room's sign and is the room's only door.)
    // ⛔ SUPERSEDED 2026-09-26 by Mark: "so its facing players so they will see this 'Manager's Office' its a wood 1-tile door, locked (until [REF#DG-02214]
    //    guard room is unlocked)" — the office door (already on the NORTH wall since 09-21) now reads 支配人室 / MANAGER'S OFFICE and carries
    //    the GUARD lock, so it opens exactly when the 番所 does (Engine9 _lockOpen). Behind it: the desk, the bank safe and the HOUSE circle.
    // ⛔ SUPERSEDED 2026-09-26 by Mark: "he will unlock the managers door (only once the guard room is activated and hat check service is
    //    back on" — the office door was lockedBy 'guard' (opened with the 番所). Now 'manager': the engine opens it when the Manager is
    //    beaten AND the guard room is on AND the hat check is on (Engine _managerDoorOpen).
    // ⛔ SUPERSEDED 2026-09-30: the north office door is gone. Its sign and its 'manager' lock live on MWEST, above — the office's only door.
    door(GDOOR, GUARD.id);
    Object.assign(map[GDOOR[0]][GDOOR[1]], { lockedBy: 'guard', locked: true });
    if (!MINIMAL) for (const d of BATH_WING.guardDoor) {
      door(d, BHALL.id);
      Object.assign(map[d[0]][d[1]], { lockedBy: 'bathhouse', locked: true });
    }
    // ⛔ SUPERSEDED 2026-10-10 by Mark: the 番所 door and floor carry no guard lock; it is open Section 0. [REF#DG-01291]
    //    The tile stays typed `shoji_door` on purpose: the doorway EXISTS, so the generator's own
    //    reachability flood still reaches the guard room and the room is not sealed off the map.
    //    `locked` is the runtime's business — the same contract DungeonChain.js states at its own
    //    `_lockedDoors` emitter: "The engine is what must honour `locked`; this only states it in the
    //    map data." Until 2026-09-02 nothing did, and the register recorded that lock as COSMETIC.
    //    Engine9's canWalk() now refuses this tile while the lock holds. Off: window._guardSectionLock.
    // ⛔⛔ LOCKING THE DOORWAY ALONE WAS THEATRE, AND THIS IS THE MEASUREMENT THAT PROVED IT: [REF#DG-01318]
    //     with zero keys turned, a player walking EAST from the hall at (57,67) ended up at (61,67)
    //     INSIDE the 番所 — straight over the counter, never touching the locked door. The counter
    //     (x59, z66-69, `counterWall` + `counterSide:'W'`) is a 30%-height seam, and player movement
    //     does not stop at it. That is a PRE-EXISTING route into the guard room, older than this lock;
    //     the lock is simply what made it matter.
    //     So the ROOM is locked, not the door: every 番所 tile carries `lockedRoom`, and canWalk
    //     refuses all of them until the keys turn. A door-shaped lock can always be walked around.
    // ⚠ A SEPARATE FIELD FROM `locked` ON PURPOSE. `locked` is the DOOR-SIGN system's field (Engine9
    //   ~:15990 reads the sign text off the tile); stamping 40 floor tiles with it would invite 40
    //   signs. `lockedRoom` says "this floor is behind a lock" and nothing else reads it.
    if (!MINIMAL) { for (const d of EHDOOR) door(d, EASTHALL.id); door(ODOOR, OFFICE_E.id); door(SDOOR, STORE_E.id); }
    for (const S of SECS_ON) {
      for (const _g of S.gate) door(_g, S.cors[0].id);
      // ⚠ THE SPUR TOUCHING THE CORRIDOR IS NOT A CONNECTION, AND THIS IS THE LINE WHOSE ABSENCE [REF#DG-01319]
      //   SEALED THE WEST LEG. Two adjacent walkable tiles with DIFFERENT roomIds are separated by a
      //   seam divider carrying a collider — the generator's own reachability flood honours that, so
      //   it reported "room 10 (Cafeteria Spur) is SEALED" on a corridor that visibly ran right up to
      //   its spur. Adjacency is geometry; a DOOR is what makes it a route.
      for (const _l of S.link) door(_l, S.cors[0].id);
      for (const R of S.rooms) door(R.door, R.id);
      for (const d of S.extraDoors || []) for (const tile of d.tiles) door(tile, d.owner);
    }
    // ── STAMP THE SECTION TILES. This is the pass whose absence made four sections invisible to [REF#DG-01293]
    //    every section-aware consumer in the engine while the room records insisted they existed.
    //    ⚠ IT RUNS LAST, AFTER EVERY rect() AND door(), because `cell()` hardcodes segmentId 0 and a
    //      door() call REPLACES the whole tile object — stamping earlier is silently undone by the
    //      next writer. ⛔ I WROTE THAT WARNING AND THEN PLACED THIS PASS ABOVE THE SECTION DOORS
    //      ANYWAY. Measured result: every section read `0+N` instead of `N` — each room kept ONE
    //      tile on segment 0, its own doorway, and `section-tile-parity` still failed. A rule you
    //      state in a comment is not a rule you have followed; only the gate can tell you that.
    //    Membership is by roomId, not by rectangle, so a tile belongs to the section that owns the
    //    ROOM standing on it — including that room's doorway, which a coordinate test would miss.
    const _secOf = new Map();
    for (const S of SECS_ON) { for (const R of S.rooms) _secOf.set(R.id, S.s); for (const Cx of S.cors) _secOf.set(Cx.id, S.s); }
    // The 番所 is not in SECS — it is drawn by rect(GUARD) with the core, so the loop above cannot [REF#DG-01391]
    // see it and its tiles would keep the segmentId 0 that `cell()` hardcodes. Seeding it here means
    // its floor AND its doorway (61,66, whose roomId is GUARD.id) both land on section 4.
    // ⚠ AND THE 風呂場 WITH IT — this is the line Mark called out ("section 0 does not have the [REF#DG-01570]
    //   bathhouse"). Same reason as the 番所 above, same fix: rect(BATH) draws with the core, so
    //   without this seeding its floor and its doorway would both read section 0.
    if (_bathSec !== 0 && !MINIMAL) { _secOf.set(BATH.id, _bathSec); _secOf.set(BHALL.id, _bathSec); }
    let _stamped = 0;
    for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) {
      const c = map[x][z];
      if (!c || c.type === 'wall') continue;
      const sid = _secOf.get(c.roomId);
      if (sid === undefined) continue;
      // A/B KNOB, kept because it is the only way to isolate this: global._sectionSegZero = true [REF#DG-01320]
      // stamps SECTION IDENTITY but leaves the STREAMING segment at 0. If a defect disappears under
      // it, the defect is caused by the non-zero segment and not by the section's geometry.
      c.segmentId = (global._sectionSegZero === true) ? 0 : sid;
      c.sectionIndex = sid; _stamped++;
    }
    try { console.log('[Section0] ' + _stamped + ' tile(s) stamped into sections 1-' + Math.max(3, _bathSec)
      + ' (was 0 — every tile read segmentId 0)'
      + '; the 番所 is section 0; the bathhouse remains section ' + _bathSec
      + '. Gate: npm run gate:sections'); } catch (_) {}
    // The attachment point for section 1. A flag, not a stairs: nothing is built beyond it yet, and [REF#DG-01256]
    // inventing a connector tile type here would trip the generator's own illegal-type self-check.
    if (!MINIMAL) for (let z = EASTHALL.z; z < EASTHALL.z + EASTHALL.h; z++) {
      const _c = map[EASTHALL.x + EASTHALL.w - 1][z];
      if (!_c || _c.type !== 'floor') throw new Error('Section0: east hall exit column is not floor');
      _c.sectionExit = 1;
    }

    // The stairs remain owned by the 番所's Section-0 record. [REF#DG-01392]
    map[DOWN[0]][DOWN[1]]             = { type: 'stairs_down', roomId: GUARD.id, segmentId: _guardSec, sectionIndex: _guardSec };
    map[STAIRS.up[0]][STAIRS.up[1]]   = { type: 'stairs_up',   roomId: HALL.id, segmentId: 0 };
    map[STAIRS.upR[0]][STAIRS.upR[1]] = { type: 'stairs_up_r', roomId: HALL.id, segmentId: 0 };
    try { global._doorHeadY = 3.7; global._doorHeadY2 = 3.7;
          global._doorOpenW2 = 3.96; global._doorOpenW = 1.96; } catch (_) {}
    // ⛔ SUPERSEDED 2026-09-06 by Mark, live in chat: shown the live glb door, "this is ugly ... its not [REF#DG-01481]
    // correct one", then "go get the exact doors in sc-distribution and replace all doors with those
    // found. 1:1 exact" — the SC-distribution (gold-v8.3-2026-08-15) 2-tile door is the wooden
    // Door-1.png double door (_cabDoor), not a glb. These two knobs were the thing masking Engine9's own
    // default flip back then (2026-09-05 register entry) and would do the same in reverse here if left
    // alone, so they move with it. See Origami.RealityEngine.9.html's DISABLED-FEATURES REGISTER.
    if (MINIMAL) { try { if (typeof global._door2Tile === 'undefined') global._door2Tile = false; } catch (_) {} }
    if (MINIMAL) { try { if (typeof global._cabDoor === 'undefined') global._cabDoor = true; } catch (_) {} }
    if (MINIMAL) { try { if (typeof global._bareDoorLeaves === 'undefined') global._bareDoorLeaves = false; } catch (_) {} }

    // ── 3. ROOM RECORDS — array index carries the id. ids 0 and 1 are load-bearing. ─────────── [REF#DG-01257]
    const rec = (r, extra) => Object.assign({ id: r.id, roomId: r.id, x: r.x, y: r.z, w: r.w, h: r.h,
      cx: r.x + (r.w >> 1), cz: r.z + (r.h >> 1), center: { x: r.x + r.w / 2, y: r.z + r.h / 2 },
      segmentId: 0, section: 0, sectionIndex: 0 }, extra);
    const rooms = [
      rec(HALL,  { roomType: 'hallway', roomName: '入口', roomNameEn: 'Main Hall',
                   isEntranceHall: true, isMainHall: true, depthHops: 0, creatorId: hall.roomId }),
      rec(CAB,   { roomType: 'cabaret', roomName: 'キャバレー', roomNameEn: 'Cabaret',
                   isCabaret: true, wallStyle: 'cabaret', depthHops: 2, creatorId: cabaret.roomId }),
      MINIMAL
        ? rec(STRIP_BOX, { roomType: 'hallway', roomName: '舞台裏', roomNameEn: 'Backstage Passage',
                           wallStyle: 'mainHall', depthHops: 3, creatorId: spine.roomId })
        : rec(SPINE, { roomType: 'hallway', roomName: '西回廊', roomNameEn: 'West Corridor',
                       wallStyle: 'mainHall', depthHops: 3, creatorId: spine.roomId }),
      rec(DRESS, { roomType: 'dressing', roomName: '楽屋', roomNameEn: "Starlette's Dressing Room",
                   isDressingRoom: true, wallStyle: 'dungeon', depthHops: 4, creatorId: dress.roomId }),
      rec(MGR,   { roomType: 'manager', roomName: '支配人室', roomNameEn: "Manager's Office",
                   isManagerOffice: true, wallStyle: 'dungeon', depthHops: 4,
                   creatorId: mgr.roomId }),
      rec(RING_BOX, { roomType: 'hallway', roomName: '回廊', roomNameEn: 'Section 0 Ring',
                      wallStyle: 'mainHall', depthHops: 1, creatorId: ring.roomId }),
      // ⛔ SUPERSEDED 2026-09-03 by Mark (same day): "section 3 should have storage, put it back ... [REF#DG-01393]
      //    use warehouse ... stop splitting that japanese name up for guard house" — the 09-03
      //    倉庫/番所 merge is DEAD. The 番所 is the guard house ONLY (番所 / GUARDPOST, one name,
      //    never suffixed with 倉庫); the storage identity lives on the EAST wing's WAREHOUSE
      //    (room 23), which is section 3's special again. `_storageRoomId` resolves by the
      //    `isStorage` flag, so removing the flag here re-points it with no second edit.
      //    ⚠ `section`/`sectionIndex`/`segmentId` ALL THREE, because three different readers exist:
      //      the engine's section-aware passes read `sectionIndex`, the chain packer's consumers read
      //      `segmentId`, and `section` is the older field still present on these records. `rec()`
      //      defaults all three to 0 and Object.assign lets these win. Leaving one behind is the
      //      record half of the same "0+4" split the tile stamp warns about.
      rec(GUARD, { roomType: 'guard', roomName: '番所', roomNameEn: 'GUARDPOST', hasStairsDown: true,
                   isGuardRoom: true,
                   section: _guardSec, sectionIndex: _guardSec, segmentId: _guardSec,
                   wallStyle: 'guard', depthHops: 1, creatorId: guard.roomId }),
      // APPENDED, never inserted — rooms[] index is read as an id by a decal lane, and slots 0 and 1 [REF#DG-01258]
      // are load-bearing (entrance hall, cabaret).
    ];
    if (!MINIMAL) rooms.push(rec(BHALL, { roomType: 'hallway', roomName: '風呂場通路', roomNameEn: 'Bathhouse Spur',
                      isBathHallway: true,
                      section: _bathSec, sectionIndex: _bathSec, segmentId: _bathSec,
                      wallStyle: 'guard', depthHops: 2, parts: BHALL.parts, noRandomSpawns: true, creatorId: bhall ? bhall.roomId : null }));
    // `special: true` on the RECORD as well as on the pre-adopt room — adopt() re-mints from the [REF#DG-01984]
    // record, so this is the copy that actually reaches the rule. See the note at adopt().
    if (!MINIMAL) rooms.push(rec(BATH, { roomType: 'bathhouse', roomName: '風呂場', roomNameEn: 'Bathhouse', special: true,
                      isBathhouse: true, noRandomSpawns: true, section: _bathSec, sectionIndex: _bathSec, segmentId: _bathSec,
                      wallStyle: 'guard', depthHops: 2, creatorId: bath ? bath.roomId : null }));
    if (!MINIMAL) rooms.push(rec(EASTHALL, { roomType: 'hallway', roomName: '東回廊', roomNameEn: 'East Passage',
                      wallStyle: 'mainHall', depthHops: 3, isSectionExit: true,
                      creatorId: easthall.roomId }));
    // ── SECTIONS 1-4. APPENDED IN ID ORDER (8,9,10,…,16) because this array's INDEX is read as an id [REF#DG-01321]
    //    by a decal lane — inserting anywhere but the end renumbers the cabaret. `sectionIndex` is the
    //    override that matters; `rec()` defaults it to 0 and Object.assign lets `extra` win.
    if (!MINIMAL) rooms.push(rec(OFFICE_E, { roomType: 'room', roomName: '帳場', roomNameEn: 'Counting Room',
                            wallStyle: 'dungeon', depthHops: 4, creatorId: officeE.roomId }));
    // ── THE 7-ETERNAL ON THE EAST PASSAGE (Mark 2026-09-26: "I want to try an experiment and have the 7-11 store along the central [REF#DG-02215]
    //    main hallway. its closed until the boss inside is won" · "the caberet is still there too, so its in section 1 to the East of
    //    caberet"). ⛔ SUPERSEDED 2026-09-26 by Mark — this room was the plain 物置 Storeroom; it is now the konbini (a memorial to Mark's
    //    parents, see Engine9 _buildKonbiniStore), storefront on the passage wall, door (65,62) facing the passage. Its footprint is
    //    STORE_E above — 8x4, x63-70 since 2026-10-01, where its seams and R-209 spacing are described. The engine dresser reads
    //    `konbiniLayout` (TILE coords) because the generic layout was sized for the DungeonChain store; `storeQueue` lines the three
    //    ghost patrons along the passage's SOUTH lane beside the storefront, leaving the north lane walkable (the default queue would
    //    run north out of the door across both lanes into the 帳場's doorway at (65,59)). bossInside → the shopkeeper is the Tenchō,
    //    the boss who must be won (fought or out-gambled) before the store opens. Back to the Storeroom: global._floor1Konbini = false.
    if (!MINIMAL) rooms.push(rec(STORE_E, (global._floor1Konbini === false)
      ? { roomType: 'room', roomName: '物置', roomNameEn: 'Storeroom', wallStyle: 'dungeon', depthHops: 4, creatorId: storeE.roomId }
      : { roomType: 'store', roomName: 'コンビニ', roomNameEn: '7-Eternal', isStore: true, bossInside: true,
          wallStyle: 'dungeon', depthHops: 4, creatorId: storeE.roomId,
          storeQueue: [[66, 61], [67, 61], [68, 61]],
          // the 8x4 at x63-70 z62-65: the till on the door's column; the four free memorial cards on the west and east shelf [REF#DG-02301]
          // columns (x63, x70); priced stock on the corners and the back row; three magic cards around the till; the drinks row
          // starting at `drinks` (the engine stands three bottles 0.65 apart along x). (64,62), west of the door, holds the
          // vending machine and (64,63) the sleeping worker the fill pass below places, so neither tile is listed.
          konbiniLayout: { keeper: [65, 64], memorial: [[63, 63], [70, 63], [63, 64], [70, 64]],
                           priced: [[63, 62], [70, 62], [63, 65], [70, 65], [64, 65], [69, 65]],
                           magic: [[64, 64], [66, 64], [65, 65]], drinks: [66, 63] } }));
    // ⚠ PUSHED IN STRICT ID ORDER — corridors first, then rooms, exactly as the ids were assigned in [REF#DG-01322]
    //   SECS. The array INDEX is read as an id by a decal lane, so a record landing at the wrong
    //   index renames a room somewhere else entirely. The assert below this loop is what proves it.
    for (const E of secRooms) {
      const S = E.S;
      const _byId = [];
      for (const CC of E.cors)
        _byId.push([CC.Cx.id, rec(CC.Cx, Object.assign({ roomType: 'hallway', roomName: CC.Cx.ja || S.ja + '通路', roomNameEn: CC.Cx.en || S.en + ' Spur',
                                           wallStyle: 'mainHall', depthHops: 5, section: S.s, sectionIndex: S.s,
                                           segmentId: S.s, creatorId: CC.cr.roomId },
                                           // Preserve A and untouched sections byte-for-byte at the record surface; [REF#DG-01482]
                                           // B alone carries its explicit CastlePlan provenance for inspection.
                                           S.castleAB === 'B' ? { castleAB: S.castleAB, castleTemplateId: S.castleTemplateId,
                                             semanticId:CC.Cx.semanticId, castleLayoutSeed:S.layoutSeed, castleCompilerVersion:S.compilerVersion } : {}))]);
      for (const RR of E.rooms) {
        const isSpecial = RR.R.id === E.rooms[0].R.id;   // the FIRST room of a leg is its special [REF#DG-01297]
        _byId.push([RR.R.id, rec(RR.R, Object.assign({
          roomType: isSpecial ? S.roomType : 'room', roomName: RR.R.ja, roomNameEn: RR.R.en,
          wallStyle: 'dungeon', depthHops: 6, section: S.s, sectionIndex: S.s, segmentId: S.s,
          creatorId: RR.cr.roomId,
        }, S.castleAB === 'B' ? { castleAB: S.castleAB, castleTemplateId: S.castleTemplateId,
          semanticId:RR.R.semanticId, missionRole:RR.R.missionRole || 'MAJOR', rokaId:RR.R.rokaId || null,
          castleLayoutSeed:S.layoutSeed, castleCompilerVersion:S.compilerVersion } : {},
        isSpecial ? { [S.flag]: true } : {}))]);
      }
      _byId.sort((a, b) => a[0] - b[0]);
      for (const [, r] of _byId) rooms.push(r);
    }
    // The array index MUST equal the record id — a decal lane reads it as one. Assert, do not assume. [REF#DG-01323]
    // B appends normal room 27 and service gallery 28; the existing 0–26 identities never move.
    // THE SECRET PORTAL ROOM — carved last so its id is the next free index (see SECRET above). Its tiles are floor in
    // section 0 (it hangs off hallway 0); the secret seam is marked on BOTH tiles so either side's reader finds it.
    if (global._secretPortalRoom !== false) {
      SECRET.id = rooms.reduce((m, r) => Math.max(m, r.id), -1) + 1;
      for (let x = SECRET.x; x < SECRET.x + SECRET.w; x++) for (let z = SECRET.z; z < SECRET.z + SECRET.h; z++) {
        if (!map[x][z] || map[x][z].type !== 'wall') throw new Error('Section0: the secret room would overwrite ' + (map[x][z] && map[x][z].type) + ' at ' + x + ',' + z);
        map[x][z] = Object.assign(cell(SECRET.id), { sectionIndex: 0 });
      }
      const _hx = SECRET_EDGE[0] + 1, _hz = SECRET_EDGE[1];
      if (!map[_hx][_hz] || map[_hx][_hz].roomId !== HALL.id || map[_hx][_hz].type !== 'floor') throw new Error('Section0: the secret edge does not face hallway 0 floor at ' + _hx + ',' + _hz);
      const _mx = SECRET_NORTH_EDGE[0], _mz = SECRET_NORTH_EDGE[1] - 1;
      if (!map[_mx][_mz] || map[_mx][_mz].type !== 'floor') throw new Error('Section0: the secret north edge does not face main hall floor at ' + _mx + ',' + _mz);
      if (SECRET_ENTRANCE === 'secret') {
        map[SECRET_EDGE[0]][SECRET_EDGE[1]].secretEdges = ['E'];
        map[_hx][_hz].secretEdges = ['W'];
      } else {
        door(SECRET_EDGE, SECRET.id);                                       // the room's own edge tile on the seam, as every door here is [REF#DG-02302]
        door(SECRET_NORTH_EDGE, SECRET.id);                                 // Mark 2026-10-14: north shoji into the Section 0 main hall. [REF#DG-02334]
        map[SECRET_EDGE[0]][SECRET_EDGE[1]].sectionIndex = 0;
        map[SECRET_NORTH_EDGE[0]][SECRET_NORTH_EDGE[1]].sectionIndex = 0;
      }
      rooms.push(rec(SECRET, { roomType: 'secret', roomName: 'Secret Room', roomNameEn: 'Secret Room', isSecret: true, isRealmPortal: true,
                               wallStyle: 'dungeon', depthHops: 1, section: 0, sectionIndex: 0, segmentId: 0, entrance: SECRET_ENTRANCE,
                               secretEdge: { x: SECRET_EDGE[0], z: SECRET_EDGE[1], dir: 'E', hall: { x: _hx, z: _hz } },
                               mainHallEdge: { x: SECRET_NORTH_EDGE[0], z: SECRET_NORTH_EDGE[1], dir: 'N', hall: { x: _mx, z: _mz } } }));
      global._secretPortalRoomId = SECRET.id;
    }
    rooms.sort((a,b) => a.id-b.id);
    if (!MINIMAL) {
      const openEdge = (x, z, dir, nx, nz, opposite) => {
        map[x][z].doors = (map[x][z].doors || '') + dir;
        map[nx][nz].doors = (map[nx][nz].doors || '') + opposite;
      };
      for (const [x, z] of BATH_WING.bathOpening) openEdge(x, z, 'N', x, z - 1, 'S');
      for (const r of rooms.filter(r => r.noRandomSpawns)) for (let x = r.x; x < r.x + r.w; x++) for (let z = r.y; z < r.y + r.h; z++) {
        if (map[x][z].roomId === r.id) map[x][z].noRandomSpawns = true;
      }
    }
    rooms.forEach((r, i) => { if (r.id !== i) throw new Error('Section0: rooms[' + i + '] carries id ' + r.id + ' — index/id drift'); });
    if (SECTION_1.castleAB === 'B') {
      try { castleProof = castle.verify(SECTION_1, map); }
      catch (error) { reportSection1CastleABFault(error.message); throw error; }
    }
    global._section1CastleProof = castleProof;

    // ── 4. SELF-CHECK. THROW rather than warn. Grid only — the LOOK is Mark's gate. ─────────── [REF#DG-01259]
    const sp = map[SPAWN.x][SPAWN.z];
    // the spawn is ON the stairs_up flight since 2026-09-13 (Mark: "have player start on stairway") — a stair tile is [REF#DG-02056]
    // walkable (canWalk allows every non-wall type). ⚠ MEASURED 2026-09-14: this line still demanded 'floor', the throw
    // was caught by the engine's fallback, and floor 1 silently became the PROCEDURAL map for one evening.
    if (!sp || (sp.type !== 'floor' && sp.type !== 'stairs_up' && sp.type !== 'stairs_up_r')) throw new Error('Section0: spawn is not walkable floor');
    const KNOWN = { wall: 1, floor: 1, shoji_door: 1, stairs_up: 1, stairs_up_r: 1, stairs_down: 1 };
    for (let x = 0; x < MAP_W; x++) for (let z = 0; z < MAP_H; z++) {
      const c = map[x][z];
      if (!KNOWN[c.type]) throw new Error('Section0: illegal tile type ' + c.type + ' at ' + x + ',' + z);
      if (c.type !== 'wall' && !(c.roomId >= 0)) throw new Error('Section0: non-wall tile without roomId at ' + x + ',' + z);
      if (c.type === 'wall' && !c.counterWall && !c.lowWall) {   // BAND LAW — designed tiles exempt BY NAME [REF#DG-01260]
        const wk = (a, b) => map[a] && map[a][b] && map[a][b].type !== 'wall';
        if ((wk(x - 1, z) && wk(x + 1, z)) || (wk(x, z - 1) && wk(x, z + 1)))
          throw new Error('Section0: BAND DEFECT — wall tile between walkables at ' + x + ',' + z);
      }
    }
    // REACHABILITY, THE ENGINE'S WAY — same-roomId edges, door tiles, or `doors` edge flags (the [REF#DG-01261]
    // open junctions). A seam between two different roomIds without any of those is a DIVIDER WITH
    // A COLLIDER (Engine9 _wallEdge; measured in MAP_RESEARCH_R1).
    const DIRV = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
    const flagOpen = (c1, c2, dx, dz) => {
      // `secretEdges` too: the secret room's seam has no collider, so the player walks it like an open crossing (2026-10-01) [REF#DG-02303]
      for (const key of ['doors', 'secretEdges']) {
        const d1 = c1[key], d2 = c2[key];
        if (d1) for (const k of d1) { const v = DIRV[k]; if (v && v[0] === dx && v[1] === dz) return true; }
        if (d2) for (const k of d2) { const v = DIRV[k]; if (v && v[0] === -dx && v[1] === -dz) return true; }
      }
      return false;
    };
    const pass = (a, b, a2, b2) => { const c1 = map[a][b], c2 = map[a2] && map[a2][b2];
      if (!c2 || c2.type === 'wall') return false;
      return c1.roomId === c2.roomId || c1.type === 'shoji_door' || c2.type === 'shoji_door'
          || flagOpen(c1, c2, a2 - a, b2 - b); };
    const seen = new Set([SPAWN.x + ',' + SPAWN.z]), q = [[SPAWN.x, SPAWN.z]], reached = new Set([HALL.id]);
    while (q.length) { const t = q.pop(), x = t[0], z = t[1];
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + d[0], nz = z + d[1], k = nx + ',' + nz;
        if (seen.has(k) || !pass(x, z, nx, nz)) continue;
        seen.add(k); reached.add(map[nx][nz].roomId); q.push([nx, nz]);
      } }
    for (const r of rooms) if (!reached.has(r.id))
      throw new Error('Section0: room ' + r.id + ' (' + r.roomNameEn + ') is SEALED — unreachable from spawn');
    // THE STAGE TAKES NO DOOR — the cabaret's north row is where Starlette performs. [REF#DG-01262]
    // A north-row door on the WEST wall is allowed (the staff door); nothing may open north through the stage wall.
    for (let x = CAB.x; x < CAB.x + CAB.w; x++)
      // ⛔ SUPERSEDED 2026-09-27 by Mark: "put the door on that north wall to the west of the stage, that 1 tile there" — NDOOR (x56) opens north [REF#DG-02216]
      // through the stage wall into the backstage passage; every other north-row door is still refused.
      if (map[x][CAB.z].type === 'shoji_door' && (x !== CWEST[0] || CAB.z !== CWEST[1] || map[x][CAB.z - 1].type !== 'wall')
          && !(x === NDOOR[0] && CAB.z === NDOOR[1] && map[x][CAB.z - 1].type === 'floor')) throw new Error('Section0: a door was placed in the STAGE wall at ' + x + ',' + CAB.z);
    // HALLWAY 0 CARRIES EXACTLY ONE DOOR: THE DOUBLES AT ITS END — Mark's law. Sweep, don't trust. [REF#DG-01263]
    for (let z = HALL.z; z < HALL.z + HALL.h; z++) for (let x = HALL.x - 1; x <= HALL.x + HALL.w; x++) {
      const c = map[x] && map[x][z];
      if (c && c.type === 'shoji_door' && !(z === HALL.z && c.roomId === HALL.id)
          && !(SECRET.id >= 0 && c.roomId === SECRET.id && x === SECRET_EDGE[0] && z === SECRET_EDGE[1]))
        throw new Error('Section0: a door touches hallway 0 at ' + x + ',' + z + ' — only the end doubles are legal');
    }
    if (map[GATE[0][0]][GATE[0][1]].type !== 'shoji_door' || map[GATE[1][0]][GATE[1][1]].type !== 'shoji_door')
      throw new Error('Section0: the hall-end double door is missing');
    const law = C.validate();
    if (law.length) throw new Error('Section0: CREATOR LAW — ' + law.join(' | '));

    console.log('[Section0] floor ' + level + ' — SC-HARDENING APPROACH RESTORED (gold 8660ec3, measured): ' +
      'spawn at the foot of HALLWAY 0 (2x6, room 0) -> open into the ring -> cabaret SOUTH DOUBLES dead ahead, stage north. ' +
      '番所 east of the hall, its NORTHERN half behind a seam counter at 30%, door onto the ring. '
      + (MINIMAL ? 'MINIMAL CUT (Mark 2026-09-05): hall + 番所 + section 0 only, backstage L strip, nothing locked, '
                   + rooms.length + ' rooms. Old floor: window._floor1Minimal=false.'
                 : '7 rooms, 6 doorway tiles; the 楽屋 and 支配人室 open only through the cabaret.'));

    // ── ONE SLEEPING WORKER PER SECTION ROOM (Mark 2026-09-02: "Each room will have a bed [REF#DG-01301]
    //    + monster sleeping") ────────────────────────────────────────────────────────────────────
    //    ⛔ SUPERSEDED 2026-09-02: this returned `mobSpawns: []`. ONE cause, FOUR symptoms — every
    //    special room measured `residents: 0`, the floor censused `bedMeshes: 0`, `[PERMIT-KEEPER]`
    //    reported KITCHEN / FACTORY / GUARD_POST permits UNOBTAINABLE, and the whole floor had no
    //    monster in it. All four were this empty array.
    //
    //    ⚠ NO SLEEP FLAG, AND NO BED PLACED HERE, ON PURPOSE — BOTH ALREADY EXIST.
    //      · SLEEP: the engine's spawn-sleep sweep lies down any body whose tile roomId >= 2
    //        (DungeonChain ~:4088, "it sleeps for free like the workers"). Section rooms are all
    //        roomId >= 9, so these sleep without a flag. Inventing one would be a second authority
    //        over the same state.
    //      · BED: `_bedForSleeper` (Engine9 ~:59445) has given "one bed per SLEEPER" since 08-05 and
    //        the sweep uses the floor as a futon where no cot stands. A bed follows a sleeper; it is
    //        not placed next to one.
    //      ⛔ THE REASON THAT NEEDED SAYING TWICE: two seats, independently, reported "no bed prop
    //        exists in this engine" from a grep for `bed`/`futon`. The geometry is called a COT, and
    //        the guard-room block builds real legs, rails, canvas and a blanket. **An enumeration is
    //        only as good as its vocabulary, and absence measured through the wrong word is not
    //        absence.** I repeated that error myself before it was caught.
    //    ⚠ HP RIDES THE CURVE, NEVER A CONSTANT — same shape as DungeonChain's `hpForLevel` so
    //      Mark's "floor 1 = level 1 monsters, floor 2 = level 2" holds without editing this file.
    //    ⚠ NOT `isInspector`, NOT `isGuardOgre`. Both are contracts counted elsewhere (the inspector
    //      block states "exactly four exist, one per section"), and a fifth would break a gate that
    //      has nothing to do with this change.
    //    Off: global._sectionSleepers = false.
    const mobSpawns = [];
    if (global._sectionSleepers !== false) {
      const _hpBase = (typeof global._monHpBase === 'number') ? global._monHpBase : 50;
      const _hpStep = (typeof global._monHpStep === 'number') ? global._monHpStep : 0.10;
      const _hpFor = (lvl) => Math.max(1, Math.round(_hpBase * Math.pow(1 + _hpStep, Math.max(0, (lvl | 0) - 1))));
      const _hp = _hpFor(level);
      const _taken = new Set();
      // Vary the body per room rather than filling three legs with one archetype. Three identical [REF#DG-01302]
      // legs is the shape that drew the complaint when every special sat in one section; the record
      // of that order lives in the DISABLED-FEATURES register, not in this comment.
      // THE STAFF IS A MIX (Mark 2026-09-20: "make more imps as workers too + mummys not just goblins please, mix"):
      // goblin · imp · mummy · imp · goblin · mummy in turn — a third imps, a third mummies, a third goblins, never two
      // of a kind in a row.
      const _KINDS = [
        { nameKey: 'yakuza_goblin', targetHeight: 1.75, vuln: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_imp',    targetHeight: 1.55, vuln: { FIRE: 1.0, WATER: 1.2, EARTH: 1.0, WIND: 0.8, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_mummy',  targetHeight: 1.70, vuln: { FIRE: 1.6, WATER: 0.7, EARTH: 1.0, WIND: 0.9, VOID: 1.0, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_imp',    targetHeight: 1.55, vuln: { FIRE: 1.0, WATER: 1.2, EARTH: 1.0, WIND: 0.8, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_goblin', targetHeight: 1.75, vuln: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_mummy',  targetHeight: 1.70, vuln: { FIRE: 1.6, WATER: 0.7, EARTH: 1.0, WIND: 0.9, VOID: 1.0, DEFAULT: 1.0 } },
      ];
      // No `ogre` in this cycle: it fills ORDINARY worker rooms, and an ogre belongs only to a special [REF#DG-01483]
      // room. The special-room ogres are the Building Inspectors placed further down (one per section
      // special) and the Gate Ogre in the 番所. Adding an ogre entry here puts one in a worker room
      // again — see knowledge/design/AI4_BUILD_SECTION0_2026-09-05.md for the measured case.
      // THE STAFF ROLLS ON THE RUN SEED (Mark 2026-09-21: "when will the seed work - its the exact same monsters at exact same
      // spots"). This block had NO randomness: kinds walked the _KINDS cycle in room order and every body stood on the FIRST
      // free interior tile of its room, so floor 1 was identical on every seed. Now the kind is drawn from the cycle at a
      // seeded offset (still never two alike in a row — the cycle is what guarantees it) and the post is a seeded pick
      // among the room's free interior tiles. Same rng idiom as the wing orcs below, its own salt.
      const _seedW = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : Date.now();
      let _ws = ((parseInt(String(_seedW), 10) || 7) ^ (((level | 0) + 1) * 0x9E3779B1)) ^ 0x3c6ef372;
      const _wrng = () => { _ws = (Math.imul(_ws ^ (_ws >>> 15), 0x2c1b3c6d) >>> 0); _ws = (_ws ^ (_ws >>> 12)) >>> 0; return (_ws & 0xffffff) / 0x1000000; };
      let _k = Math.floor(_wrng() * _KINDS.length);
      for (const S of SECS_ON) for (const R of S.rooms) {
        // INTERIOR tiles only, and never the doorway — a body on the door blocks the only way in. [REF#DG-01324]
        const _free = [];
        for (let x = R.x + 1; x < R.x + R.w - 1; x++)
          for (let z = R.z + 1; z < R.z + R.h - 1; z++) {
            const t = map[x] && map[x][z];
            if (t && t.type === 'floor' && t.roomId === R.id && !_taken.has(x + ',' + z)) _free.push([x, z]);
          }
        const _at = _free.length ? _free[Math.floor(_wrng() * _free.length)] : null;
        if (!_at) continue;                       // skip rather than stack two bodies on one tile [REF#DG-01325]
        _taken.add(_at[0] + ',' + _at[1]);
        const K = _KINDS[_k++ % _KINDS.length];
        mobSpawns.push({
          id: 'sec' + S.s + '-sleeper-' + R.id, nameKey: K.nameKey, name: R.en + ' Worker', type: 'monster',
          x: _at[0], z: _at[1], hp: _hp, maxHp: _hp,
          isHostile: false,                       // asleep at his post; wakes on collision or a strike [REF#DG-01326]
          segmentId: S.s,
          targetHeight: K.targetHeight,           // SIZE RIDES targetHeight — nothing reads sp.scale for a monster [REF#DG-01327]
          vulnerability: K.vuln,
        });
      }
      // ⚠ COUNT THE WORKERS BEFORE THE NEXT TWO BLOCKS PUSH TO THE SAME ARRAY — reading [REF#DG-01328]
      //   `mobSpawns.length` after them reported 16 workers when there are 12. A total is not
      //   a category count, and this log is what a later seat will quote.
      const _workers = mobSpawns.length;

      // ── AN ORC IN EVERY WING, IN A VACANT ROOM (Mark 2026-09-20: "make there be a orc in each section, random in an open [REF#DG-02116]
      //    room. they dont work. they just push workers around"). One per wing section, in a randomly chosen 空室 (the
      //    room's sleeper is REPLACED - the orc has the room to himself, then wanders). Seeded on the run seed + level so a
      //    given seed always picks the same rooms. Same body as the ring orc: hpMul 2, `_dweller` (owns no slot, no song
      //    moves him), hostile as every orc is. The shove itself is the engine's _tickOrcBullies. Off: global._wingOrcs = false.
      if (global._wingOrcs !== false) {
        const _seedO = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : Date.now();
        let _os = ((parseInt(String(_seedO), 10) || 7) ^ (((level | 0) + 1) * 0x9E3779B1)) ^ 0x7f4a7c15;
        const _orng = () => { _os = (Math.imul(_os ^ (_os >>> 15), 0x2c1b3c6d) >>> 0); _os = (_os ^ (_os >>> 12)) >>> 0; return (_os & 0xffffff) / 0x1000000; };
        const _placedO = [];
        const _perWing = (typeof global._wingOrcsPer === 'number') ? Math.max(0, global._wingOrcsPer | 0) : 2;   // Mark 2026-09-20 (later): "have more orcs in each section - bully enabled 2 per section" [REF#DG-02118]
        for (const S of SECS_ON) for (let _oi = 0; _oi < _perWing; _oi++) {
          const _vac = S.rooms.filter(R => R.en === 'Vacant Room' && !mobSpawns.some(m => m && m.id === 'sec' + S.s + '-orc-' + R.id));
          if (!_vac.length) continue;
          const R = _vac[Math.floor(_orng() * _vac.length)];
          const _wi = mobSpawns.findIndex(m => m && m.id === 'sec' + S.s + '-sleeper-' + R.id);
          const _at = (_wi >= 0) ? [mobSpawns[_wi].x, mobSpawns[_wi].z] : null;
          if (!_at) continue;
          mobSpawns.splice(_wi, 1);   // the orc takes the room; its worker is not placed [REF#DG-02117]
          mobSpawns.push({
            id: 'sec' + S.s + '-orc-' + R.id, nameKey: 'orc', name: 'Orc', type: 'monster',
            x: _at[0], z: _at[1], hp: _hpFor(level) * 2, maxHp: _hpFor(level) * 2,
            isHostile: true, isOrc: true, meleeOnly: true, _dweller: true,
            segmentId: S.s,
            vulnerability: { FIRE: 1.1, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.1, DEFAULT: 1.0 },
          });
          _placedO.push('s' + S.s + ': ' + R.en + ' #' + R.id + ' @' + _at[0] + ',' + _at[1]);
        }
        try { console.log('[WING-ORCS] ' + _perWing + ' orc(s) per wing, each in its own vacant room, on the run seed — ' + (_placedO.join(' · ') || 'none') + '. They shove the staff, never work. Off: global._wingOrcs=false'); } catch (_) {}
      }

      // Hallway 0 / the Section 0 ring is intro-only. Do not author combat encounters here. [REF#DG-02335]

      // ── T1 · ONE SLEEPING INSPECTOR PER SPECIAL BUILDING — PORTED, NOT DESIGNED ───────── [REF#DG-01303]
      //    Ported from DungeonChain.js:4036-4075 ("ONE SLEEPING INSPECTOR PER SPECIAL BUILDING"),
      //    which is BYTE-FOR-BYTE the same block the SC-hardened gold tag carries — `isInspector`
      //    counts 2 in DungeonChain and 21 in Engine9 on both gold and now, so nothing was ever
      //    deleted. It has simply never RUN on floor 1: Section0 short-circuits that generator, and
      //    that is the whole reason no inspector has ever been seen here.
      //    ⚠⚠ THE CONTRACT SAYS "EXACTLY FOUR EXIST, ONE PER SECTION" AND A PROGRESSION GATE COUNTS
      //      THEM. This floor now has THREE sections, so this places THREE, not four. That is a
      //      reported number, not a silent one — see the console line below.
      //    ⚠ NO SLEEP FLAG: the engine's sweep lays down any body on roomId >= 2, and every special
      //      room qualifies. A second sleep mechanism here would be a rival writer of the same state.
      //    ⚠ SIZE RIDES targetHeight, NEVER `scale` — the source block's own `scale: 1.6` has done
      //      nothing since 2026-08-04 because no monster path reads it.
      //    Off: global._specialRoomInspector = false. Knob: _inspectorHpMult (3).
      if (global._specialRoomInspector !== false) {
        const _insHp = Math.round(_hp * ((typeof global._inspectorHpMult === 'number') ? global._inspectorHpMult : 3));
        let _ins = 0;
        for (const S of SECS_ON) {
          const R = S.rooms[0];                       // the leg's SPECIAL is its first room [REF#DG-01329]
          // THE FAR END FROM THE DOOR (Mark 2026-09-11: "it will be at the opposite end of every room from [REF#DG-02009]
          // the 1-entry door"). Was the bottom-left interior tile. `R.door` is the room's one door.
          let _at = null, _best = -1;
          for (let z = R.z + 1; z < R.z + R.h - 1; z++)
            for (let x = R.x + 1; x < R.x + R.w - 1; x++) {
              const t = map[x] && map[x][z];
              if (!(t && t.type === 'floor' && t.roomId === R.id && !_taken.has(x + ',' + z))) continue;
              // farthest along the door's axis, on the door's line — the charge runs the room's length at the doorway [REF#DG-02010]
              const _hz = R.door ? (R.door[1] === R.z || R.door[1] === R.z + R.h - 1) : true;
              const d = R.door ? ((_hz ? Math.abs(z - R.door[1]) : Math.abs(x - R.door[0])) * 1000 - (_hz ? Math.abs(x - R.door[0]) : Math.abs(z - R.door[1]))) : 0;
              if (d > _best) { _best = d; _at = [x, z]; }
            }
          if (!_at) continue;                         // skip rather than stack two bodies on a tile [REF#DG-01330]
          _taken.add(_at[0] + ',' + _at[1]);
          mobSpawns.push({
            id: 'inspector-' + R.id, nameKey: 'ogre', name: 'Building Inspector', type: 'monster',
            x: _at[0], z: _at[1], hp: _insHp, maxHp: _insHp,
            isHostile: false,          // asleep at its post; wakes hostile on collision or a strike [REF#DG-01331]
            isInspector: true,         // the hook combat/AI keys on: no gambling, +5 karma, camera route [REF#DG-01332 → see REF#DG-00549]
            noFloat: true, meleeOnly: true, targetHeight: 2.35,
            segmentId: S.s,
            vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
          });
          _ins++;
        }
        try { console.log('[Section0] ' + _ins + ' Building Inspector(s) placed, one per special building '
          + '(' + SECS_ON.map(S => S.en).join(' · ') + '). ⚠ The source contract reads "exactly four, one per '
          + 'section" and this floor has ' + SECS_ON.length + ' sections — reporting ' + _ins + ', not four. '
          + 'Off: global._specialRoomInspector=false'); } catch (_) {}
      }

      // ── T2 · THE GATE OGRE, ASLEEP ON THE COT IN THE GUARDPOST ────────────────────────── [REF#DG-01304]
      //    Ported from DungeonChain.js:4100+ ("THE OGRE ASLEEP ON THE COT"). Its absence is why
      //    `[PERMIT-KEEPER]` reported GUARD POST PERMIT UNOBTAINABLE — the permit needs a resident.
      //    ⚠ `isGuardOgre` ONLY, never `isInspector`. Engine9 pins THIS flag onto the 番所 cot, and
      //      minting a fifth inspector would break the counted contract in T1 above.
      //    ⚠ THIS ADDS A BODY TO SECTION 0 AND NOTHING ELSE. Rooms 0-7 stay byte-identical — a spawn
      //      is not geometry, and probe-section0-immutable.js is what proves that rather than a claim.
      //    Placement copies the source exactly: walk from the SOUTH end back, so he lands deepest —
      //    the staff side, behind the counter, not in the public half by the doors.
      //    Off: global._guardRoomOgre = false. Knob: _guardOgreHpMult (4).
      if (global._guardRoomOgre !== false) {
        const _gHp = Math.round(_hp * ((typeof global._guardOgreHpMult === 'number') ? global._guardOgreHpMult : 4));
        let _at = null;
        for (let z = GUARD.z + GUARD.h - 2; z > GUARD.z && !_at; z--)
          for (let x = GUARD.x + 1; x < GUARD.x + GUARD.w - 1 && !_at; x++) {
            const t = map[x] && map[x][z];
            if (t && t.type === 'floor' && t.roomId === GUARD.id && !_taken.has(x + ',' + z)) _at = [x, z];
          }
        if (_at) {
          _taken.add(_at[0] + ',' + _at[1]);
          mobSpawns.push({
            id: 'guard-' + GUARD.id, nameKey: 'ogre', name: 'Gate Ogre', type: 'monster',
            x: _at[0], z: _at[1], hp: _gHp, maxHp: _gHp,
            isHostile: false, isGuardOgre: true,
            noFloat: true, meleeOnly: true, targetHeight: 2.35,
            // Engine9 buckets a spawn by `sp.segmentId` when it is an integer and only falls back to [REF#DG-01484]
            // the tile underneath otherwise, so a literal 0 here files him under segment 0 while his
            // room, tiles and stairs carry `_guardSec`. In MINIMAL `_guardSec` is 0, so the cut is
            // byte-identical; on the full floor he now travels with the 番所.
            segmentId: _guardSec,
            vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 0.9, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 },
          });
          try { console.log('[Section0] Gate Ogre asleep on the cot in the GUARDPOST at (' + _at[0] + ',' + _at[1]
            + '), ' + _gHp + ' hp — GUARD POST PERMIT now has a resident to take it from.'); } catch (_) {}
        }
      }

      try { console.log('[Section0] ' + _workers + ' sleeping worker(s) placed, one per section room '
        + '(hp ' + _hp + ' at level ' + level + '). They sleep via the engine sweep and draw a bed via _bedForSleeper. '
        + 'Off: global._sectionSleepers=false'); } catch (_) {}
    }

    // ── GUARD PATROL — ONE SKELETON GUARD + ONE SKELETON ARCHER PER SECTION (Mark 2026-09-11: "lets add our [REF#DG-01985]
    //    guard patrol back - the skeleton + archer … there is one patrol per section. they do not come back").
    //    Floor 1 never had them: the pair lives in DungeonChain's _skelPatrols pass, and this file replaced
    //    that generator for floor 1 without carrying the pass over. Same record shape as DungeonChain
    //    (~:4200) because the engine's HALL PATROL driver (Engine9 ~:90122) keys on the id prefix
    //    `skel-patrol-` and walks the segment's hall end-to-end; "do not come back" = the normal one-shot
    //    spawn record, dead stays dead (the segment store's cleared list). Placed on the section's own
    //    HALL tiles so the route derives; falls back to a room if a section has no hall floor.
    //    Off: global._skelPatrols = false.
    if (!MINIMAL && global._skelPatrols !== false) {
      const _hpB2 = (typeof global._monHpBase === 'number') ? global._monHpBase : 50, _hpS2 = (typeof global._monHpStep === 'number') ? global._monHpStep : 0.10;
      const _hpP = Math.max(1, Math.round(_hpB2 * Math.pow(1 + _hpS2, Math.max(0, (level | 0) - 1))));   // same curve as the sleepers' _hpFor (scoped inside its own block) [REF#DG-01986]
      const _VG = { FIRE: 0.8, WATER: 1.0, EARTH: 1.35, WIND: 1.0, VOID: 1.15, DEFAULT: 1.0 };   // = DungeonChain skeleton_guard [REF#DG-01987]
      const _VA = { FIRE: 0.8, WATER: 1.0, EARTH: 1.3,  WIND: 1.1, VOID: 1.15, DEFAULT: 1.0 };   // = DungeonChain skeleton_archer [REF#DG-01988]
      const _usedP = new Set(mobSpawns.map(m => m.x + ',' + m.z));
      const _placedP = [];
      let _np = 0;
      for (const S of SECS_ON) {
        // floor-1 tiles carry NO `hall` flag (measured 2026-09-11: 0 of 980) — a corridor is a ROOM with [REF#DG-01989]
        // roomType 'hallway'. Collect the section's hallway-room ids and pick tiles by roomId.
        const _hallIds = new Set(rooms.filter(r => r && r.segmentId === S.s && (r.roomType === 'hallway' || r.kind === 'hallway')).map(r => r.id));
        const _pick = (hallOnly) => {
          const cells = [];
          for (let x = 1; x < map.length - 1; x++) for (let z = 1; z < map[0].length - 1; z++) {
            const t = map[x] && map[x][z];
            if (!t || t.type !== 'floor' || t.segmentId !== S.s || _usedP.has(x + ',' + z)) continue;
            const _isHall = !!t.hall || _hallIds.has(t.roomId);
            if (hallOnly ? !_isHall : _isHall) continue;
            cells.push([x, z]);
          }
          cells.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
          return cells;
        };
        let cells = _pick(true); let _where = 'hall';
        // ON THE DRIVER'S OWN ROUTE: Engine9's HALL PATROL driver (~:90122) derives ONE route per segment — the two [REF#DG-01990]
        // extreme tiles along the longer axis of ALL the segment's hall tiles. Anything placed elsewhere walks into a
        // wall toward it (measured 2026-09-11: a guard on the spine walked, an archer in a 6x2 side hall stood
        // forever). The moving guard uses those endpoints; the archer is subsequently moved to a lateral gate flank.
        let gc, ac;
        if (cells.length >= 2) {
          let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
          for (const c of cells) { if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minZ) minZ = c[1]; if (c[1] > maxZ) maxZ = c[1]; }
          const alongX = (maxX - minX) >= (maxZ - minZ);
          let a = null, b = null;
          for (const c of cells) { const v = alongX ? c[0] : c[1]; if (!a || v < (alongX ? a[0] : a[1])) a = c; if (!b || v > (alongX ? b[0] : b[1])) b = c; }
          if (a && b && (a[0] !== b[0] || a[1] !== b[1])) { gc = a; ac = b; _where = 'route ' + a[0] + ',' + a[1] + '→' + b[0] + ',' + b[1]; }
        }
        if (!gc) { cells = _pick(false); _where = 'room'; if (cells.length < 2) continue; gc = cells[0]; ac = cells[cells.length - 1]; }
        // The roaming guard owns the whole hall. The archer belongs at the section [REF#DG-02336]
        // entrance, but on a lateral flank tile — never directly in the two-leaf doorway.
        const _gate = Array.isArray(S.gate) ? S.gate : [];
        const _gateTiles = new Set(_gate.map(c => c[0] + ',' + c[1]));
        if (_gate.length) {
          const gx = _gate.reduce((n, c) => n + c[0], 0) / _gate.length;
          const gz = _gate.reduce((n, c) => n + c[1], 0) / _gate.length;
          const spanX = Math.max(..._gate.map(c => c[0])) !== Math.min(..._gate.map(c => c[0]));
          const _gateD2 = c => (c[0] - gx) * (c[0] - gx) + (c[1] - gz) * (c[1] - gz);
          // Start the moving guard at the route end farthest from its doorway so its [REF#DG-02337]
          // existing end-to-end patrol reaches and operates that doorway.
          if (_gateD2(gc) < _gateD2(ac)) { const _tmp = gc; gc = ac; ac = _tmp; }
          const _flanks = cells.filter(c => {
            if (_gateTiles.has(c[0] + ',' + c[1])) return false;
            const normal = spanX ? Math.abs(c[1] - gz) : Math.abs(c[0] - gx);
            const tangent = spanX ? Math.abs(c[0] - gx) : Math.abs(c[1] - gz);
            return normal <= 1.1 && tangent >= 1;
          }).sort((a, b) => _gateD2(a) - _gateD2(b) || a[0] - b[0] || a[1] - b[1]);
          if (_flanks.length) { ac = _flanks[0]; _where += ' · archer flank ' + ac[0] + ',' + ac[1]; }
        }
        _usedP.add(gc[0] + ',' + gc[1]); _usedP.add(ac[0] + ',' + ac[1]);
        mobSpawns.push({ id: 'skel-patrol-guard-L' + level + '-s' + S.s + '-' + (_np++), nameKey: 'skeleton_guard', name: 'Skeleton Guard', type: 'monster',
          x: gc[0], z: gc[1], hp: _hpP, maxHp: _hpP, isHostile: false, isSkeleton: true, meleeOnly: true, segmentId: S.s, vulnerability: _VG });
        mobSpawns.push({ id: 'skel-patrol-archer-L' + level + '-s' + S.s + '-' + (_np++), nameKey: 'skeleton_archer', name: 'Skeleton Archer', type: 'monster',
          x: ac[0], z: ac[1], hp: 30, maxHp: 30, isHostile: false, isSkeletonArcher: true, stationarySectionArcher: true, meleeOnly: false, segmentId: S.s, vulnerability: _VA });
        _placedP.push('s' + S.s + ':' + _where);
      }
      // Restored 2026-10-20: the four fixed north watch posts from 926c8b8f. [REF#DG-02338]
      const northWatch = mobSpawns.filter(m => /^skel-patrol-(guard|archer)-/.test(m.id)).slice(0, 4);
      northWatch.forEach((m, i) => {
        _usedP.delete(m.x + ',' + m.z);
        m.x = RING_BOX.x + [3, 6, 10, 12][i];
        m.z = RING_BOX.z + 1;
        m.segmentId = 0;
        m.patrolRoomId = RING_ID;
        m.stationaryNorthGuard = true;
        _usedP.add(m.x + ',' + m.z);
      });
      // ── THE ENTRANCE-HALL SENTRY (Mark 2026-09-14: "can you figure out why the guard patrol isn't working? … perhaps [REF#DG-02063]
      //    can have one encircle the section 0 2-tile hallway? just one guard random it is archer or guard, so players can
      //    immediately have a guard doing patrol as an ally or a fast target to attack."). WHY HE NEVER MET ONE: the pairs
      //    above live on sections 1-3, behind their gates — every one of them is real (the song placer even hands two of
      //    them a song) but a player in the head never sees a section hall. The engine's driver keeps this one to the hall
      //    (`patrolRoomId`, ~Engine9 HALL PATROL) and walks him to random hall tiles. Guard or archer is decided by the
      //    run's own seed so a load meets the same man — and his id carries the kind, so "dead stays dead" cannot
      //    resurrect him as the other. Off: global._hallSentry = false.
      // ── Five patrols now start at distinct seeded-random ring tiles. Karma does not affect their count or placement;
      //    the legacy `_hallSentryKarmaHostile` option still controls whether the patrols are hostile at birth.
      // ── Mark 2026-09-14 (third order, after seeing him): "who should start on top of section 0 hallway NE of caberet heading
      //    West on patrol circle." The patrol circle IS the ring — the 2-tile hallway squared around the cabaret (RING, id 5).
      //    Each patrol starts on a seeded-random walkable ring tile, then follows the same corner loop (NE→NW→SW→SE)
      //    forever; the engine's driver does not let the wander picker interrupt it.
      //    ⛔ SUPERSEDED 2026-09-14 by Mark (this order): the mid-hall spawn and the "hall head" spawn of the same day.
      // The ring's NE and SW outer-lane corners, published for the engine's hallway lanterns (2026-09-20). Tile coords; the engine converts.
      try { global._ringLanternCorners = [[RING_BOX.x + RING_BOX.w - 1, RING_BOX.z], [RING_BOX.x, RING_BOX.z + RING_BOX.h - 1]]; } catch (_) {}
      if (global._hallSentry !== false) {
        const _rx0 = RING_BOX.x, _rx1 = RING_BOX.x + RING_BOX.w - 1, _rz0 = RING_BOX.z, _rz1 = RING_BOX.z + RING_BOX.h - 1;   // outer lane corners x48/x62 · z50/z65 [REF#DG-02064]
        const _LOOP = [[_rx1, _rz0], [_rx0, _rz0], [_rx0, _rz1], [_rx1, _rz1]];   // NE → NW (west along the top) → SW → SE → back [REF#DG-02065]
        const _seedRaw = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : ((typeof global._mapSeed === 'number') ? global._mapSeed : Date.now());   // the run seed is a STRING on window (measured "1249358483") [REF#DG-02059]
        const _seed = parseInt(String(_seedRaw), 10);
        const _sAbs = Number.isFinite(_seed) ? Math.abs(_seed) : 0;
        const _kind = (_sAbs % 2 === 0) ? 'guard' : 'archer';
        let _spawnRng = (_sAbs ^ 0x51EC0A7) >>> 0;
        if (!_spawnRng) _spawnRng = 0x9E3779B9;
        const _spawnRandom = () => { _spawnRng ^= _spawnRng << 13; _spawnRng ^= _spawnRng >>> 17; _spawnRng ^= _spawnRng << 5; return (_spawnRng >>> 0) / 0x100000000; };
        // karma at floor gen — the same two sources the engine's own _karmaGen reads (OniBaba live, else the descent record) [REF#DG-02059]
        let _karma = 0;
        try { const _o = (typeof global.getOniBabaSafe === 'function') && global.getOniBabaSafe(); if (_o && typeof _o.karma === 'number') _karma = _o.karma; } catch (_) {}
        if (_karma === 0) { try { const _d = JSON.parse(global.sessionStorage.getItem('origami.v8.descent') || 'null'); if (_d && typeof _d.karma === 'number') _karma = _d.karma; } catch (_) {} }
        const _hostileK = (typeof global._hallSentryHostileKarma === 'number') ? global._hallSentryHostileKarma : -100;
        // ⛔ SUPERSEDED 2026-09-15 by Mark: "the guards are always nuetral they can be attack/wager - they will attack if there is [REF#DG-02070]
        //    noise of any attack." — the low-karma / rude-player HOSTILE sentry is retired: he is born neutral, and turns on the
        //    player only when he hears an attack (Engine9 _soundDisturbance, the guard-alarm) or is struck. Restore the old
        //    birth behavior: window._hallSentryKarmaHostile = true.
        const _rude = (_karma <= _hostileK) || (global._playerWasRude === true);
        const _jerk = (global._hallSentryKarmaHostile === true) && _rude;
        const _spots = [];
        const _ringCells = [];
        for (let x = _rx0; x <= _rx1; x++) for (let z = _rz0; z <= _rz1; z++) {
          const t = map[x] && map[x][z];
          if (t && t.type === 'floor' && t.segmentId === 0 && t.roomId === RING_ID && !_usedP.has(x + ',' + z)) _ringCells.push([x, z]);
        }
        for (let i = _ringCells.length - 1; i > 0; i--) {
          const j = Math.floor(_spawnRandom() * (i + 1));
          [_ringCells[i], _ringCells[j]] = [_ringCells[j], _ringCells[i]];
        }
        // Mark 2026-10-13: one random sentry beside each cabaret entrance; remaining patrols stay scattered. [REF#DG-02339]
        const _cornerOrder = _LOOP.slice();
        for (let i = _cornerOrder.length - 1; i > 0; i--) {
          const j = Math.floor(_spawnRandom() * (i + 1));
          [_cornerOrder[i], _cornerOrder[j]] = [_cornerOrder[j], _cornerOrder[i]];
        }
        // Two in hallway0 plus two in each of sections 1–3: six of eight guards serve the section halls. [REF#DG-02340]
        const entrancePosts = [
          [[Math.min(...CSOUTH.map(p => p[0])) - 1, CSOUTH[0][1] + 1],
           [Math.max(...CSOUTH.map(p => p[0])) + 1, CSOUTH[0][1] + 1]],
          [[CEAST[0][0] + 1, Math.min(...CEAST.map(p => p[1])) - 1],
           [CEAST[0][0] + 1, Math.max(...CEAST.map(p => p[1])) + 1]]
        ];
        for (let i = 0; i < entrancePosts.length; i++) {
          const freePost = ([x,z]) => map[x]?.[z]?.type === 'floor' && map[x][z].roomId === RING_ID && !_usedP.has(x + ',' + z);
          let candidates = entrancePosts[i].filter(freePost);
          // Keep the sentry at this entrance when an earlier spawn occupies both preferred circles. [REF#DG-02341]
          if (!candidates.length) candidates = entrancePosts[i]
            .flatMap(([x,z]) => i === 0 ? [[x,z+1],[x-1,z],[x+1,z]] : [[x+1,z],[x,z-1],[x,z+1]])
            .filter(freePost);
          const spot = candidates[Math.floor(_spawnRandom() * candidates.length)];
          if (!spot) {
            global.parent.postMessage({ type:'ENGINE_ANOMALY', kind:'CABARET_GUARD_SPAWN', error:'No free circle at ' + (i === 0 ? 'south' : 'east') + ' entrance' }, '*');
            continue;
          }
          let start = 0, best = Infinity;
          for (let k = 0; k < _LOOP.length; k++) {
            const dx = spot[0] - _LOOP[k][0], dz = spot[1] - _LOOP[k][1], d = dx * dx + dz * dz;
            if (d < best) { best = d; start = k; }
          }
          _spots.push([spot, start, i === 0 ? 'south' : 'east']);
          _usedP.add(spot[0] + ',' + spot[1]);
        }
        // A fixed west-side sentry is the cabaret patrol's designated help post. [REF#DG-02342]
        // Pick a real, unclaimed ring floor tile nearest the west wall and midpoint.
        const _westMidZ = (_rz0 + _rz1) / 2;
        const _westHelperSpot = _ringCells
          .filter(([x, z]) => x <= _rx0 + 1 && !_usedP.has(x + ',' + z))
          // ONE STEP OFF THE WALL (2026-10-16 late, CODER 1, Mark: "dont let guards be seen doing this either", screenshot of this guard half inside [REF#DG-02343]
          //    the wall by the section door): the tie-break used to take the SMALLEST x — the tile hugging the west wall and DOOR_010 — so his body
          //    rendered through the wall mesh. It now prefers the tile one off the wall (x = _rx0 + 1).
          .sort((a, b) => Math.abs(a[1] - _westMidZ) - Math.abs(b[1] - _westMidZ) || (Math.abs(a[0] - (_rx0 + 1)) - Math.abs(b[0] - (_rx0 + 1))))[0] || null;
        if (_westHelperSpot) _usedP.add(_westHelperSpot[0] + ',' + _westHelperSpot[1]);
        else global.parent.postMessage({ type:'ENGINE_ANOMALY', kind:'CABARET_GUARD_SPAWN', error:'No free west-side cabaret guard tile' }, '*');
        const _mk = (kind, gx, gz, n, start) => (kind === 'guard'
          ? { id: 'skel-patrol-hall-guard-L' + level + '-s0' + (n ? '-' + n : ''), nameKey: 'skeleton_guard', name: 'Skeleton Guard', type: 'monster',
              x: gx, z: gz, hp: _hpP, maxHp: _hpP, isHostile: _jerk, forceHostile: _jerk || undefined, isSkeleton: true, meleeOnly: true, segmentId: 0, patrolRoomId: RING_ID, patrolLoop: _LOOP, patrolLoopStart: start, vulnerability: _VG }
          : { id: 'skel-patrol-hall-archer-L' + level + '-s0' + (n ? '-' + n : ''), nameKey: 'skeleton_archer', name: 'Skeleton Archer', type: 'monster',
              x: gx, z: gz, hp: 30, maxHp: 30, isHostile: _jerk, forceHostile: _jerk || undefined, isSkeletonArcher: true, meleeOnly: false, segmentId: 0, patrolRoomId: RING_ID, patrolLoop: _LOOP, patrolLoopStart: start, vulnerability: _VA });
        // The hallway0 pair begins on distinct walkable tiles beside the front and east entrances. [REF#DG-02344]
        const _n = _spots.length;
        for (let i = 0; i < _n; i++) {
          const [[_sx, _sz], _start, entrance] = _spots[i];
          const _k = i < 2 ? (_spawnRandom() < 0.5 ? 'guard' : 'archer') : (i % 2 === 0) ? _kind : (_kind === 'guard' ? 'archer' : 'guard');
          mobSpawns.push(Object.assign(_mk(_k, _sx, _sz, i, _start), { cabaretEntrance: entrance, cabaretPost: [_sx, _sz] }));
          _placedP.push('s0:ring ' + _k + (_jerk ? ' HOSTILE' : '') + ' @' + _sx + ',' + _sz);
        }
        if (_westHelperSpot) {
          const _westGuard = _mk('guard', _westHelperSpot[0], _westHelperSpot[1], 'west', 0);
          _westGuard.id = 'skel-cabaret-west-guard-L' + level;
          _westGuard.stationaryNorthGuard = true;
          _westGuard.guardHelpAnchor = true;
          delete _westGuard.patrolRoomId; delete _westGuard.patrolLoop; delete _westGuard.patrolLoopStart;
          mobSpawns.push(_westGuard);
          _placedP.push('s0:west cabaret help guard @' + _westHelperSpot[0] + ',' + _westHelperSpot[1]);
        }
        try { console.log('[SKEL-PATROL] ring patrols ×' + _n + (_jerk ? ' HOSTILE (karma ' + _karma + (global._playerWasRude === true ? ', rude' : '') + ')' : '') + ' — seeded distinct ring positions, following the corner loop'); } catch (_) {}
      }
      try { console.log('[SKEL-PATROL] floor-1 guard+archer pair per section — ' + (_placedP.join(', ') || 'none') + '. Dead stays dead. Off: global._skelPatrols=false'); } catch (_) {}
    }
    // ── HALLWAY LOOT, ONE ROLL PER SECTION (Mark 2026-09-14: "perhaps have some random loot in hallways? sometimes. 25% of [REF#DG-02061]
    //    times. random in 2-tile hallways per section (1 rng) loot chance. To make the game interesting."). Each section
    //    (the entrance hall counts as section 0's) rolls ONCE from the run's seed: on a hit, one card from a small mixed
    //    pool lands on a random tile of one of the section's 2-wide hallways. The id is stable (`hall-loot-s<n>`), so the
    //    segment store's taken-list keeps a picked-up card gone on a load, and the entry culls in the engine let it
    //    stand (same exemption as the sentry). Knobs: global._hallLootChance (0.25) · _hallLoot = false.
    if (!MINIMAL && global._hallLoot !== false) {
      const _seedRaw2 = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : Date.now();
      // ⛔ FIXED 2026-09-20 (Mark: "keep seeing same loot game after game again in the dungeon levels — [REF#PENDING] [REF#DG-02110]
      // should be part of RNG for the entire game"). `level` was missing from this seed entirely, so this
      // block ran the exact same roll-per-section / tile-pick / item-pick sequence on EVERY floor of a run
      // (same seed in, same call order, same rolls out) — floor 1's hallway loot was floor 7's hallway loot.
      // The sibling bat/ant coin streams 100 lines below (_mkCoinStream) already mix `((level|0)+1) *
      // 0x9E3779B1` into their seed for exactly this reason; this block simply never adopted that idiom.
      let _rs = ((parseInt(String(_seedRaw2), 10) || 7) ^ (((level | 0) + 1) * 0x9E3779B1)) ^ 0x5bd1e995;
      const _rng = () => { _rs = (Math.imul(_rs ^ (_rs >>> 15), 0x2c1b3c6d) >>> 0); _rs = (_rs ^ (_rs >>> 12)) >>> 0; return (_rs & 0xffffff) / 0x1000000; };
      const _chance = (typeof global._hallLootChance === 'number') ? global._hallLootChance : 0.25;
      const _POOL = [
        { catId: 'FIRE',  title: 'FIREBALL',    desc: 'Inferno star',          kanji: '火', attr: '(DMG*4DICE)' },
        { catId: 'EARTH', title: 'BOULDER',     desc: 'Heavy impact',          kanji: '地', attr: '(STUN*2DICE)' },
        { catId: 'WATER', title: 'TIDE',        desc: 'Washes away',           kanji: '水', attr: '(SLOW*3DICE)' },
        { catId: 'WIND',  title: 'CYCLONE',     desc: 'Seeks & spins',         kanji: '旋', attr: '(SPIN*3DICE)' },
        { catId: 'ITEM',  title: 'HEAL POTION', desc: 'Restores health',       kanji: '薬', attr: '(HEAL)' },
        { catId: 'ITEM',  title: 'GOHAN',       desc: 'A warm bowl of rice.',  kanji: '飯', attr: 'HEAL OVER TIME' },
        { catId: 'MISSILE', title: 'SHURIKEN x3', desc: 'Throwing stars',      kanji: '投', attr: '(DMG*1DICE)' },
        { catId: 'MISSILE', title: 'ARROWS x4',  desc: 'A few dropped arrows', kanji: '矢', attr: '(DMG*1DICE)' },
        { catId: 'GOLD_COIN', title: 'GOLD COINS', desc: 'Someone dropped these.', kanji: '金', attr: '(WORTH 30 GOLD)' },
      ];
      const _usedL = new Set(mobSpawns.map(m => m.x + ',' + m.z));
      const _placedL = [];
      const _sections = [{ s: 0 }].concat(SECS_ON.map(S => ({ s: S.s })));
      for (const S of _sections) {
        const roll = _rng();
        if (roll >= _chance) { _placedL.push('s' + S.s + ': no (' + roll.toFixed(2) + ')'); continue; }
        // the section's 2-wide hallways, by room record; a corridor tile is a room with roomType 'hallway' [REF#DG-02062]
        const _halls = rooms.filter(r => r && (r.roomType === 'hallway' || r.kind === 'hallway') && (r.w === 2 || r.h === 2)
                                       && ((S.s === 0) ? (r.segmentId === 0 || r.segmentId === undefined) : r.segmentId === S.s));
        const cells = [];
        for (const r of _halls) for (let x = r.x; x < r.x + r.w; x++) for (let z = (r.y !== undefined ? r.y : r.z); z < (r.y !== undefined ? r.y : r.z) + r.h; z++) {
          const t = map[x] && map[x][z];
          if (!t || t.type !== 'floor' || t.roomId !== r.id || _usedL.has(x + ',' + z)) continue;
          cells.push([x, z]);
        }
        if (!cells.length) { _placedL.push('s' + S.s + ': hit but no 2-wide hall tile'); continue; }
        const c = cells[Math.floor(_rng() * cells.length)];
        const pool = S.s === 0 ? _POOL.filter(item => ['ITEM', 'MISSILE', 'GOLD_COIN'].includes(item.catId)) : _POOL;
        const L = pool[Math.floor(_rng() * pool.length)];
        _usedL.add(c[0] + ',' + c[1]);
        mobSpawns.push({ id: 'hall-loot-s' + S.s + '-L' + level, type: 'loot_card', x: c[0], z: c[1], catId: L.catId, title: L.title, desc: L.desc, kanji: L.kanji, attr: L.attr, segmentId: S.s });
        _placedL.push('s' + S.s + ': ' + L.title + ' @' + c[0] + ',' + c[1]);
      }
      try { console.log('[HALL-LOOT] one 25% roll per section on the run seed — ' + _placedL.join(' · ') + '. Knob: _hallLootChance'); } catch (_) {}
      // ROOM LOOT ROLLS TOO (Mark 2026-09-21: "new monsters and loot spawns randomly EACH GAME LOAD"). One hall roll per [REF#DG-02127]
      // section was the only loot on the whole floor, so most loads carried nothing to find. Now every wing STREET room
      // (never the special, the head, the cabaret or the offices) rolls once on the same seeded stream: 35% for one card
      // from the pool above, dropped on a free interior tile that no post or sleeper stands on (the room's rim rows stay
      // clear so a door is never blocked). Same mobSpawns contract as the hall drop. Knobs: _roomLootChance (0.35) · _roomLoot=false.
      if (global._roomLoot !== false) {
        const _rc = (typeof global._roomLootChance === 'number') ? global._roomLootChance : 0.35;
        const _placedR = [];
        for (const S of SECS_ON) for (const R of S.rooms) {
          if (R === S.rooms[0] || R.fixed || Number.isInteger(R.hallId)) continue;      // street rooms only [REF#DG-02128]
          const roll = _rng(); if (roll >= _rc) continue;
          const cells = [];
          for (let x = R.x + 1; x < R.x + R.w - 1; x++) for (let z = R.z + 1; z < R.z + R.h - 1; z++) {
            const t = map[x] && map[x][z];
            if (!t || t.type !== 'floor' || t.roomId !== R.id || _usedL.has(x + ',' + z)) continue;
            cells.push([x, z]);
          }
          if (!cells.length) { for (let x = R.x; x < R.x + R.w; x++) for (let z = R.z; z < R.z + R.h; z++) {   // 3x3: the rim IS the room [REF#DG-02129]
            const t = map[x] && map[x][z]; if (t && t.type === 'floor' && t.roomId === R.id && !_usedL.has(x + ',' + z) && !(x === R.door[0] && z === R.door[1])) cells.push([x, z]); } }
          if (!cells.length) continue;
          const c = cells[Math.floor(_rng() * cells.length)];
          const L = _POOL[Math.floor(_rng() * _POOL.length)];
          _usedL.add(c[0] + ',' + c[1]);
          mobSpawns.push({ id: 'room-loot-' + R.id + '-L' + level, type: 'loot_card', x: c[0], z: c[1], catId: L.catId, title: L.title, desc: L.desc, kanji: L.kanji, attr: L.attr, segmentId: S.s });
          _placedR.push(R.en + '#' + R.id + ': ' + L.title + ' @' + c[0] + ',' + c[1]);
        }
        try { console.log('[ROOM-LOOT] ' + _placedR.length + ' street room(s) hold a card on the run seed — ' + (_placedR.join(' · ') || 'none') + '. Knobs: _roomLootChance · _roomLoot=false'); } catch (_) {}
      }
    }

    // ── NOBODY'S ROOM GETS A SLEEPER (Mark 2026-09-16: "try to ensure that most all rooms have a monster / worker on the [REF#DG-02075]
    //    first few floors so theres not endless searching for one"). MEASURED before this pass (scratch room-occupancy,
    //    seed 12345): 30 rooms, 10 with nobody on their tiles — the cabaret (its crew is the engine's), four hallway
    //    pieces, and FIVE real rooms: 楽屋 (3), 支配人室 (4), 帳場 (8), 物置 (29) and the 15×15 bathhouse (27). Every room
    //    that is not a hallway, the entrance, the cabaret or the 番所 (the engine staffs those) and has no spawn on its
    //    tiles gets ONE worker asleep on the interior tile farthest from its doors — goblin, imp, mummy in turn (a one-tile closet
    //    is skipped: a body would fill it). Asleep and
    //    not hostile, so the sleeping-dungeon start is unchanged: it wakes on a collision or a strike like every sleeper.
    //    No _rng() draw — index-based, so existing seeds keep their layout. Off: global._fillEmptyRooms = false.
    if (global._fillEmptyRooms !== false) {
      const _onTiles = new Set(mobSpawns.filter(m => m && m.type === 'monster').map(m => m.x + ',' + m.z));
      const _occRoom = new Set(); for (const k of _onTiles) { const [x, z] = k.split(',').map(Number); const t = map[x] && map[x][z]; if (t && t.roomId >= 0) _occRoom.add(t.roomId); }
      const _FILL = [
        { nameKey: 'yakuza_goblin', targetHeight: 1.75, vuln: { FIRE: 1.3, WATER: 1.0, EARTH: 0.8, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_imp',    targetHeight: 1.55, vuln: { FIRE: 1.0, WATER: 1.2, EARTH: 1.0, WIND: 0.8, VOID: 1.2, DEFAULT: 1.0 } },
        { nameKey: 'yakuza_mummy',  targetHeight: 1.70, vuln: { FIRE: 1.6, WATER: 0.7, EARTH: 1.0, WIND: 0.9, VOID: 1.0, DEFAULT: 1.0 } },
      ];
      const _hpBaseF = (typeof global._monHpBase === 'number') ? global._monHpBase : 50;
      const _hpStepF = (typeof global._monHpStep === 'number') ? global._monHpStep : 0.10;
      const _hpF = Math.max(1, Math.round(_hpBaseF * Math.pow(1 + _hpStepF, Math.max(0, (level | 0) - 1))));
      let _fi = 0; const _filled = [];
      for (const r of rooms) {
        // Mark 2026-10-14: section 0 has guards, not generated worker occupants. [REF#DG-02345]
        if ((r?.segmentId ?? 0) === 0) continue;
        if (!r || r.roomType === 'hallway' || r.kind === 'hallway' || r.isEntranceHall || r.isCabaret || r.isGuardRoom || r.roomType === 'guard') continue;
        if (_occRoom.has(r.id)) continue;
        if ((r.w - 2) * (r.h - 2) < 2) continue;   // a closet with one interior tile (the 3×3 楽屋 / 支配人室) — a body there would fill the room [REF#DG-02076]
        const z0 = (r.y !== undefined) ? r.y : r.z;
        // the room's doors: passable gaps on its wall ring [REF#DG-02077]
        const doors = [];
        for (let x = r.x; x < r.x + r.w; x++) for (const z of [z0, z0 + r.h - 1]) { const t = map[x] && map[x][z]; if (t && /door|floor/.test(String(t.type))) doors.push([x, z]); }
        for (let z = z0; z < z0 + r.h; z++) for (const x of [r.x, r.x + r.w - 1]) { const t = map[x] && map[x][z]; if (t && /door|floor/.test(String(t.type))) doors.push([x, z]); }
        let at = null, best = -1;
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) for (let z = z0 + 1; z < z0 + r.h - 1; z++) {
          const t = map[x] && map[x][z]; if (!t || t.type !== 'floor' || t.roomId !== r.id || _onTiles.has(x + ',' + z)) continue;
          const d = doors.length ? Math.min(...doors.map(D => Math.abs(D[0] - x) + Math.abs(D[1] - z))) : 0;
          if (d > best) { best = d; at = [x, z]; }
        }
        if (!at) continue;
        const K = _FILL[_fi++ % _FILL.length];
        _onTiles.add(at[0] + ',' + at[1]);
        mobSpawns.push({
          id: 'fill-sleeper-' + r.id, nameKey: K.nameKey, name: (r.roomNameEn || 'Room') + ' Worker', type: 'monster',
          x: at[0], z: at[1], hp: _hpF, maxHp: _hpF, isHostile: false,
          segmentId: (r.segmentId !== undefined) ? r.segmentId : 0, targetHeight: K.targetHeight, vulnerability: K.vuln,
        });
        _filled.push(r.id + ':' + (r.roomNameEn || r.roomType) + '@' + at[0] + ',' + at[1] + ' ' + K.nameKey);
      }
      try { console.log('[FILL] nobody\'s room gets a sleeper — ' + _filled.length + ' placed: ' + (_filled.join(' · ') || 'none needed') + '. Off: _fillEmptyRooms=false'); } catch (_) {}
    }

    // ── BATS + ANTS PER SECTION, FLOOR 1 (2026-09-18, order relayed via d1, verbatim: "add bats to the [REF#DG-02086]
    //    sections, they are more common, random 1-2 bats always 50/50", then "yes bats and ants, they
    //    are part of nethack summons arent they") — plans/CODER2_TASK_011_bats_per_section.md Step 2. Section0 has
    //    no hall:true tiles; its hallway pieces (`S.cors`) compile to ROOM records tagged roomType/kind
    //    'hallway' (same test the hallway-loot pass above uses), so that is what this targets. Only
    //    SECS_ON (sections 1-3) is walked — the level head (rooms 0/1/konbini) and the guard room are
    //    never in that array, so neither is ever touched. Two INDEPENDENT seeded streams, same idiom as
    //    DungeonChain's bat placer / Creator's dealSectionSpecials (seed ^ salt ^ level): bats draw a
    //    fair coin per section (1 or 2, in section order); ants draw their own separate coin per section
    //    at 1/2 (0 or 1, ant-<section>-1). Neither draws from `_rng()` above, so an existing seed's
    //    layout is untouched. Off: global._antsPerSection = false. (BATS ARE OFF BY DEFAULT since
    //    2026-09-18 — see the ⛔ SUPERSEDED note on the inner bat gate below; _batsPerSection = true restores.)
    if (global._batsPerSection !== false || global._antsPerSection !== false) {
      const _seedRaw3 = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : Date.now();
      const _seedNum3 = parseInt(String(_seedRaw3), 10) || 7;
      const _mkCoinStream = (salt) => {
        let h = (((_seedNum3 >>> 0) ^ salt) ^ (((level | 0) + 1) * 0x9E3779B1)) >>> 0;
        h = (h ^ 0x5bf03635) >>> 0;
        return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      };
      const _batCoin3 = _mkCoinStream(0xBA75);
      const _antCoin3 = _mkCoinStream(0xA47);
      const _koboldCoin3 = _mkCoinStream(0xC0B);   // KOBOLDS: their own stream, so adding them shifts no existing seed's layout (2026-09-28) [REF#DG-02304]
      const _occ3 = new Set(mobSpawns.map(m => m.x + ',' + m.z));
      const _placedB = [];
      for (const S of SECS_ON) {
        const _halls3 = rooms.filter(r => r && (r.roomType === 'hallway' || r.kind === 'hallway') && r.segmentId === S.s);
        const _cells3 = [];
        for (const r of _halls3) {
          const z0r = (r.y !== undefined) ? r.y : r.z;
          for (let x = r.x; x < r.x + r.w; x++) for (let z = z0r; z < z0r + r.h; z++) {
            const t = map[x] && map[x][z];
            if (!t || t.type !== 'floor' || t.roomId !== r.id || _occ3.has(x + ',' + z)) continue;
            _cells3.push([x, z]);
          }
        }
        _cells3.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
        // ⛔ SUPERSEDED 2026-09-18 by Mark: "remove bats from map generation" — the guaranteed bat placer [REF#DG-02106]
        //    is OFF BY DEFAULT. The 2026-09-17 order it served ("two new monsters to hallway spawns - ant and
        //    bat") is retired for the BAT half only; the ant placer is untouched.
        //    ⚠ THE ARCHETYPE ROWS ALONE WERE NOT ENOUGH, which is the whole reason this block is edited too.
        //      This placer is GUARANTEED and independent of the hallway archetype roll — commenting the three
        //      BAT rows out of the DungeonChain archetype table would have removed bats from the ROTATION while this code
        //      kept placing 1-2 per section every single run. Grep both the pool AND the dedicated placers.
        //    Default flipped rather than the block deleted: the seeded coin draws from its OWN private stream,
        //    so turning it off cannot shift any existing seed's layout, and turning it back on restores the
        //    exact same placement. window._batsPerSection = true restores.
        if (global._batsPerSection === true) {
          const _wantBats = (_batCoin3() < 0.5) ? 1 : 2;
          let _nb = 0;
          for (const c of _cells3) {
            if (_nb >= _wantBats) break;
            if (_occ3.has(c[0] + ',' + c[1])) continue;
            _occ3.add(c[0] + ',' + c[1]); _nb++;
            mobSpawns.push({ id: 'bat-' + S.s + '-' + _nb, nameKey: 'bat', name: 'Bat', type: 'monster', x: c[0], z: c[1], hp: 12, maxHp: 12, isHostile: true, meleeOnly: true, segmentId: S.s, vulnerability: { FIRE: 1.0, WATER: 1.0, EARTH: 1.0, WIND: 1.4, VOID: 1.0, DEFAULT: 1.0 } });
          }
          _placedB.push('s' + S.s + ': ' + _nb + ' bat(s)');
        }
        if (global._antsPerSection !== false) {
          const _wantAnts = (_antCoin3() < 0.5) ? 0 : 1;
          if (_wantAnts > 0) {
            for (const c of _cells3) {
              if (_occ3.has(c[0] + ',' + c[1])) continue;
              _occ3.add(c[0] + ',' + c[1]);
              mobSpawns.push({ id: 'ant-' + S.s + '-1', nameKey: 'ant', name: 'Ant', type: 'monster', x: c[0], z: c[1], hp: 15, maxHp: 15, isHostile: true, meleeOnly: true, noFlee: true, segmentId: S.s, vulnerability: { FIRE: 1.5, WATER: 1.0, EARTH: 0.7, WIND: 1.0, VOID: 1.0, DEFAULT: 1.0 } });
              break;
            }
          }
        }
        // KOBOLDS (2026-09-28): at most ONE per section, a coin-flip each (window._koboldChance, 0.5), on a free interior tile of one of [REF#DG-02305]
        // the section's rooms. A worker that never fights: 8 HP exact, 50 gold, flees and hides at the first sign of trouble (engine
        // _tickKobolds). Off: window._koboldsPerSection = false.
        if (global._koboldsPerSection !== false && _koboldCoin3() < ((typeof global._koboldChance === 'number') ? global._koboldChance : 0.5)) {
          const _kc = [];
          for (const R of (S.rooms || [])) for (let x = R.x + 1; x < R.x + R.w - 1; x++) for (let z = R.z + 1; z < R.z + R.h - 1; z++) {
            const t = map[x] && map[x][z];
            if (t && t.type === 'floor' && t.roomId === R.id && !_occ3.has(x + ',' + z)) _kc.push([x, z]);
          }
          if (_kc.length) {
            const c = _kc[Math.floor(_koboldCoin3() * _kc.length)];
            _occ3.add(c[0] + ',' + c[1]);
            mobSpawns.push({ id: 'kobold-' + S.s, nameKey: 'kobold', name: 'Kobold', type: 'monster', x: c[0], z: c[1], hp: 8, maxHp: 8, hpExact: true, isHostile: false, isKobold: true, segmentId: S.s, vulnerability: { FIRE: 1.2, WATER: 1.0, EARTH: 1.0, WIND: 1.0, VOID: 1.2, DEFAULT: 1.0 } });
            _placedB.push('s' + S.s + ': kobold');
          }
        }
      }
      try { console.log('[ANTS] floor 1 per-section placement (bats removed 2026-09-18, Mark) — ' + (_placedB.join(', ') || 'none') + '. Off: _antsPerSection=false · bats back on: _batsPerSection=true'); } catch (_) {}
    }

    // ── ROAMERS: 0-2 HUNGRY GHOST PACKS ON THE RUN SEED (master plan C-4, [REF#DG-02200]
    //    plans/UNDERWORLD_CASTLE_MASTER_PLAN_2026-09-19.md: "roaming ghosts") — never shipped until now.
    //    Floor 1's roster was measured 100% identical in kind across 200 seeds (probe-rng-variety.js)
    //    because every existing body (workers, orcs, inspectors, gate ogre, skel patrol, ants) is an
    //    always-on architectural fixture, not a roll. Hungry ghosts are the one archetype
    //    (DungeonChain.js:3939, `isGhost`, groupMin/Max 3, 10hp, 30% transparent, no minLevel gate)
    //    that floors 2+ already carry and floor 1 never rolled. Shape copied byte-for-byte from
    //    DungeonChain's own ghost-pack push (:4229-4245) so the engine-side flags (`ghostAlpha`,
    //    `noFlee`, `meleeOnly`) behave identically on both floors. Own seeded stream (salt 0x9057),
    //    so it cannot shift any other placement's tiles. Off: global._floor1Roamers = false.
    if (global._floor1Roamers !== false) {
      const _seedR = (global._origamiGameSeed !== undefined && global._origamiGameSeed !== null) ? global._origamiGameSeed : Date.now();
      let _rs4 = ((parseInt(String(_seedR), 10) || 7) ^ (((level | 0) + 1) * 0x9E3779B1)) ^ 0x9057;
      const _rrng = () => { _rs4 = (Math.imul(_rs4 ^ (_rs4 >>> 15), 0x2c1b3c6d) >>> 0); _rs4 = (_rs4 ^ (_rs4 >>> 12)) >>> 0; return (_rs4 & 0xffffff) / 0x1000000; };
      const _occR = new Set(mobSpawns.map(m => m.x + ',' + m.z));
      const _packs = Math.floor(_rrng() * 3);   // 0, 1 or 2 packs, uniform [REF#DG-02201]
      const _placedR = [];
      for (let p = 0; p < _packs; p++) {
        const S = SECS_ON[Math.floor(_rrng() * SECS_ON.length)];
        // ── FLOOR 1: THE ROAMERS START SHUT IN THE SPECIAL ROOMS ───────────────────────────────────── [REF#DG-02306]
        //    A new player should be able to walk in, look around and learn the game. These packs drop into
        //    any hallway of a live section, and section 0's hallways are the ring and the spine that wrap
        //    the cabaret — so a pack could be waiting a few tiles from the first scene before the player
        //    had done anything at all. On floor 1 they are placed INSIDE the special rooms instead, which
        //    sit behind doors: nothing is removed from the floor, the player just has to open a door to
        //    meet them, and that is their choice to make rather than the floor's.
        //    The cabaret is excluded by name — it is the one special room the player is sent to.
        //    Floor 1 only. Off (back to the hallways): global._ghostJail = false · knob _ghostJailTypes.
        //    ⚠ 'store' IS THE KONBINI AND IS NOT A CELL. It was in this list on the first build and that
        //      put roaming hungry-ghost packs inside the 7-Eternal, which is the one room on this floor
        //      that already has its own cast and is not a place to stack intruders. It is excluded by
        //      roomType AND by the isStore flag, because a store room reaching here under some other
        //      roomType would slip past a name-only test.
        const _SPECIAL_TYPES = Array.isArray(global._ghostJailTypes) ? global._ghostJailTypes
                             : ['storage', 'manager', 'guard', 'factory', 'dressing', 'cafeteria', 'bathhouse'];
        const _jail = ((level | 0) <= 1) && global._ghostJail !== false;
        const _pool4 = _jail
            ? rooms.filter(r => r && r.id !== CAB.id && r.isStore !== true && String(r.roomType || '') !== 'store'
                                && _SPECIAL_TYPES.indexOf(String(r.roomType || '')) >= 0)
            : rooms.filter(r => r && (r.roomType === 'hallway' || r.kind === 'hallway') && r.segmentId === S.s);
        if (!_pool4.length) continue;
        const r = _pool4[Math.floor(_rrng() * _pool4.length)];
        const z0r = (r.y !== undefined) ? r.y : r.z;
        const _cells4 = [];
        for (let x = r.x; x < r.x + r.w; x++) for (let z = z0r; z < z0r + r.h; z++) {
          const t = map[x] && map[x][z];
          if (t && t.type === 'floor' && t.roomId === r.id && !_occR.has(x + ',' + z)) _cells4.push([x, z]);
        }
        let _n = 0;
        for (let gi = 0; gi < 3 && _cells4.length; gi++) {
          const idx = Math.floor(_rrng() * _cells4.length);
          const c = _cells4.splice(idx, 1)[0];
          _occR.add(c[0] + ',' + c[1]); _n++;
          mobSpawns.push({
            id: 'ghost-roam-' + S.s + '-' + p + '-' + gi, nameKey: 'hungry_ghost', name: 'Hungry Ghost', type: 'monster',
            x: c[0], z: c[1], hp: 10, maxHp: 10,
            isHostile: true, isGhost: true, ghostAlpha: 0.7, noFlee: true, meleeOnly: true,
            segmentId: S.s,
            vulnerability: { FIRE: 1.2, WATER: 0.8, EARTH: 1.0, WIND: 1.25, VOID: 0.5, DEFAULT: 1.0 },
          });
        }
        if (_n) _placedR.push('s' + S.s + ': ' + _n + ' in ' + (r.en || r.id));
      }
      try { console.log('[ROAMERS] ' + _packs + ' hungry-ghost pack(s) on the run seed' + (((level | 0) <= 1 && global._ghostJail !== false) ? ' [JAILED in special rooms, floor 1]' : '') + ' — ' + (_placedR.join(' · ') || 'none') + '. Off: global._floor1Roamers=false'); } catch (_) {}
    }

    for (let i = mobSpawns.length - 1; i >= 0; i--) {
      const m = mobSpawns[i];
      if (m.type === 'monster' && map[m.x]?.[m.z]?.noRandomSpawns) mobSpawns.splice(i, 1);
    }
    return { map, rooms, spawnX: SPAWN.x, spawnZ: SPAWN.z, mobSpawns, vendingAnchor: null,
             ...(castleProof ? { castleProof } : {}),
             // ONE gate record per section, joining it to section 0 — the shape DungeonChain emits [REF#DG-01333]
             // (`kind:'section'`, :4694) so anything already reading section gates reads these too.
             gates: SECS_ON.map(S => ({ kind: 'section', gateIndex: S.s, sectionFrom: 0, sectionTo: S.s,
                                     dir: S.dir, tiles: S.gate.map(g => g.slice()) })),
             // ⛔ SUPERSEDED 2026-09-02 — this returned ONE segment, with the note "sections are an [REF#DG-01294]
             // identity axis, not a streaming axis". That belief is retracted at its source above.
             // FIVE entries now: section 0 plus one per section, each bounding only its own rooms.
             // ⚠ BOUNDS ARE DERIVED FROM THE ROOMS, NOT TYPED IN. A hand-written box that disagrees
             //   with the tiles is the same defect one layer up — the streamer would cull geometry
             //   that is really there, and it would look like a rendering bug rather than a data one.
             segments: (() => {
               const _bounds = (ids) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
                 for (const r of rooms) { if (ids.indexOf(r.id) < 0) continue;
                   a = Math.min(a, r.x); b = Math.min(b, r.y); c = Math.max(c, r.x + r.w); d = Math.max(d, r.y + r.h); }
                 return { minX: a - 1, minZ: b - 1, maxX: c + 1, maxZ: d + 1 }; };
               const _secIds = {};
               for (const S of SECS_ON) _secIds[S.s] = S.rooms.map(R => R.id).concat(S.cors.map(C2 => C2.id));
               const _all = new Set(Object.values(_secIds).flat());
               // The bathhouse retains section 4 after the 番所 returns to section 0. Keep its room and spur out of [REF#DG-01485]
               // segment 0 so a room is never claimed by two streaming segments. [REF#DG-01485]
               const _bathSeg = (_bathSec === 4) ? [BATH.id, BHALL.id] : [];
               const _zero = rooms.map(r => r.id).filter(id => !_all.has(id) && _bathSeg.indexOf(id) < 0);
               return [{ id: 0, roomIds: _zero, bounds: _bounds(_zero) }].concat(
                 SECS_ON.map(S => ({ id: S.s, roomIds: _secIds[S.s], bounds: _bounds(_secIds[S.s]) })),
                 _bathSeg.length ? [{ id: 4, roomIds: _bathSeg, bounds: _bounds(_bathSeg) }] : []);
             })() };
  }

  // ── SECTION 0 AS DATA — one builder, two tables (2026-10-02) ──────────────────────────────────────────────────────────── [REF#DG-02307]
  //    knowledge/design/FLOORS_2PLUS_FLOOR1_SECTION0_PLAN_2026-10-02.md. Floors 2-7 get floor 1's section 0 with every room 10%
  //    larger (corridors keep their widths, hallway 0 stays 2x8). The floor-1 code above is NOT rewritten: its rooms are created
  //    interleaved with the bathhouse and the wings, and Creator numbers rooms in creation order, so pulling section 0 out of it
  //    would renumber floor 1. Instead this builder takes a LAYOUT in local coordinates (the ring's north-west corner = 0,0) and
  //    S0_LAYOUT_F1 is floor 1's own layout re-expressed that way; scripts/probe-s0-core-1002.js proves the builder fed S0_LAYOUT_F1
  //    reproduces floor 1's section 0 tile for tile and record for record, which is what "modelled exactly" is checked against.
  //    S0_LAYOUT_PLUS10 is the +10% table for floors 2-7. Nothing calls the builder in play yet (step 3 wires it into DungeonChain).
  //    The builder writes ONLY the map it is given and returns records: no globals, no Date.now, no rng.
  const S0_LAYOUT_F1 = {
    ring: { w: 15, h: 16 },
    cab: { x: 7, z: 7, w: 6, h: 7 }, spine: { x: 2, z: 5, w: 11, h: 9 },
    dress: { x: 5, z: 2, w: 3, h: 3 }, mgr: { x: 10, z: 2, w: 3, h: 3 },
    backstage: [[8, 6], [8, 5], [8, 4], [9, 4], [8, 3], [9, 3], [8, 2], [9, 2]], neck: [8, 5],
    ndoor: [8, 7], cwest: [7, 7], csouth: [[9, 13], [10, 13]], ceast: [[12, 10], [12, 11]], deast: [7, 3], mwest: [10, 3],
    hall: { x: 9, z: 16, w: 2, h: 8 }, gate: [[9, 16], [10, 16]], stairs: { up: [9, 23], upR: [10, 23] }, spawn: [9, 23],
    guard: { x: 11, z: 16, w: 5, h: 8 }, counterRows: 4, downGuard: [14, 21], downOffice: null,
    easthall: { x: 15, z: 10, w: 7, h: 2 }, ehdoor: [[15, 10], [15, 11]],
    officeE: { x: 15, z: 7, w: 4, h: 3 }, odoor: [17, 9], storeE: { x: 15, z: 12, w: 8, h: 4 }, sdoor: [17, 12],
    storeQueue: [[18, 11], [19, 11], [20, 11]],
    konbini: { keeper: [17, 14], memorial: [[15, 13], [22, 13], [15, 14], [22, 14]],
               priced: [[15, 12], [22, 12], [15, 15], [22, 15], [16, 15], [21, 15]],
               magic: [[16, 14], [18, 14], [17, 15]], drinks: [18, 13] },
    gates: { 1: { tiles: [[-1, 7], [-1, 8]], side: 'w' }, 2: { tiles: [[4, -1], [5, -1]], side: 'n' }, 3: { tiles: [[22, 10], [22, 11]], side: 'e' } },
  };
  // +10%: cabaret 6x7 → 7x8 (exact 10% — hallway 0 sits half a tile off the stage centre; the answer is in the plan doc), 楽屋 / 支配人室 3x3 → 4x4, [REF#DG-02309]
  // 西回廊 plaza 5x7 → 6x8, 帳場 4x3 → 5x4, 7-Eternal 8x4 → 9x5, 番所 5x8 → 6x9 (its size is a setting; deeper
  // floors pass their own). Every relation of floor 1 is kept: the stage band's two rock rows, the backstage passage on the
  // cabaret's second column, the doors on the same rows/columns of their walls, hallway 0 under the cabaret's doubles, the
  // 番所 on its east flank sharing the counter wall, the east passage on the
  // cabaret's east-door rows with the 帳場 above and the 7-Eternal below, and the three section gates on the same legs.
  // The east passage is 8 long (floor 1: 7) because floor 1's east gate sits over the 7-Eternal's LAST column: the store's
  // floor is then the perimeter that caps the gate's south end. At 7 the 9-wide store ran a tile past the gate, store floor on
  // both sides of that end, and Creator's `doorway-line` reads such a doorway as not in a wall line.
  // SEEN 2026-10-02 (node, Creator.validateGeometry on hub floor 2, 3 seeds): the east gate's doorway-line fires 3/3 with the
  // passage 7 long and 0/3 with it 8 long; the one other raw doorway-line (the cabaret's north-west door pair) is floor 1's
  // own, same tile pattern, and Creator.repair() opens it into a plain doorway on both — knowledge/design/FLOORS_2PLUS_FLOOR1_SECTION0_PLAN_2026-10-02.md
  const S0_LAYOUT_PLUS10 = {
    ring: { w: 17, h: 18 },
    cab: { x: 8, z: 8, w: 7, h: 8 }, spine: { x: 2, z: 6, w: 13, h: 10 },
    dress: { x: 5, z: 2, w: 4, h: 4 }, mgr: { x: 11, z: 2, w: 4, h: 4 },
    backstage: [[9, 7], [9, 6], [9, 5], [10, 5], [9, 4], [10, 4], [9, 3], [10, 3], [9, 2], [10, 2]], neck: [9, 6],
    ndoor: [9, 8], cwest: [8, 8], csouth: [[10, 15], [11, 15]], ceast: [[14, 11], [14, 12]], deast: [8, 3], mwest: [11, 3],
    hall: { x: 10, z: 18, w: 2, h: 8 }, gate: [[10, 18], [11, 18]], stairs: { up: [10, 25], upR: [11, 25] }, spawn: [10, 25],
    guard: { x: 12, z: 18, w: 6, h: 9 }, counterRows: 4, downGuard: null, downOffice: [13, 4],
    easthall: { x: 17, z: 11, w: 8, h: 2 }, ehdoor: [[17, 11], [17, 12]],
    officeE: { x: 17, z: 7, w: 5, h: 4 }, odoor: [19, 10], storeE: { x: 17, z: 13, w: 9, h: 5 }, sdoor: [19, 13],
    storeQueue: [[20, 12], [21, 12], [22, 12]],
    konbini: { keeper: [19, 15], memorial: [[17, 14], [25, 14], [17, 15], [25, 15]],
               priced: [[17, 13], [25, 13], [17, 17], [25, 17], [18, 17], [24, 17]],
               magic: [[18, 15], [20, 15], [19, 16]], drinks: [20, 14] },
    gates: { 1: { tiles: [[-1, 8], [-1, 9]], side: 'w' }, 2: { tiles: [[4, -1], [5, -1]], side: 'n' }, 3: { tiles: [[25, 11], [25, 12]], side: 'e' } },
  };
  // the bounding box a layout needs, gates included — the caller reserves it before placing anything else [REF#DG-02310]
  function s0Footprint(L) {
    const xs = [], zs = [];
    const add = (r) => { xs.push(r.x, r.x + r.w - 1); zs.push(r.z, r.z + r.h - 1); };
    add({ x: 0, z: 0, w: L.ring.w, h: L.ring.h }); add(L.hall); add(L.guard); add(L.easthall); add(L.officeE); add(L.storeE);
    for (const k of Object.keys(L.gates)) for (const t of L.gates[k].tiles) { xs.push(t[0]); zs.push(t[1]); }
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  }
  // o: { ox, oz — map position of local (0,0) · ids: { hall, cab, spine, dress, mgr, ring, guard, easthall, officeE, storeE } [REF#DG-02311]
  //      · guardSec (0) · down: 'guard' | 'office' | null
  //      · konbini (true) · createInCreator (true) }
  function buildSection0Core(C, map, L, o) {
    const ox = o.ox | 0, oz = o.oz | 0, I = o.ids, gsec = (o.guardSec == null) ? 0 : o.guardSec;
    const P = (t) => [t[0] + ox, t[1] + oz];
    const R = (r, id) => ({ id, x: r.x + ox, z: r.z + oz, w: r.w, h: r.h });
    const at = (x, z) => { if (!map[x] || !map[x][z]) throw new Error('Section0 core: tile ' + x + ',' + z + ' is off the map'); return map[x][z]; };
    const RING = { id: I.ring, x: ox, z: oz, w: L.ring.w, h: L.ring.h };
    const RUNS = [{ x: ox, z: oz, w: L.ring.w, h: 2 }, { x: ox, z: oz + L.ring.h - 2, w: L.ring.w, h: 2 },
                  { x: ox, z: oz + 2, w: 2, h: L.ring.h - 4 }, { x: ox + L.ring.w - 2, z: oz + 2, w: 2, h: L.ring.h - 4 }];
    const HALL = R(L.hall, I.hall), CAB = R(L.cab, I.cab), SPINE = R(L.spine, I.spine), DRESS = R(L.dress, I.dress), MGR = R(L.mgr, I.mgr);
    const GUARD = R(L.guard, I.guard), EASTHALL = R(L.easthall, I.easthall), OFFICE_E = R(L.officeE, I.officeE), STORE_E = R(L.storeE, I.storeE);
    // the 番所's door: its north wall's midpoint, held over the ring's south run so a wide 番所 never opens under the 7-Eternal [REF#DG-02312]
    const GDOOR = [Math.min(GUARD.x + ((GUARD.w - 1) >> 1), RING.x + RING.w - 1), GUARD.z];
    const GATE = L.gate.map(P), CSOUTH = L.csouth.map(P), CEAST = L.ceast.map(P), CWEST = P(L.cwest), NDOOR = P(L.ndoor);
    const DEAST = P(L.deast), MWEST = P(L.mwest), NECK = P(L.neck), EHDOOR = L.ehdoor.map(P), ODOOR = P(L.odoor), SDOOR = P(L.sdoor);
    const out = { creator: {} };
    // ── author (Creator declarations carry the door sides through adopt's re-mint) ── [REF#DG-02313]
    if (o.createInCreator !== false) {
      const cr = (kind, r, extra) => C.createRoom(Object.assign({ shapeKey: null, segmentId: 0, kind, genId: r.id, x: r.x, z: r.z, w: r.w, h: r.h }, extra || {}));
      const K = out.creator;
      K.hall = cr('hallway', HALL); K.cab = cr('room', CAB); K.spine = cr('hallway', SPINE); K.dress = cr('room', DRESS); K.mgr = cr('room', MGR);
      K.ring = cr('hallway', RING); K.guard = cr('room', GUARD, { segmentId: gsec }); K.easthall = cr('hallway', EASTHALL);
      K.officeE = cr('room', OFFICE_E, { shapeKey: 'R' + OFFICE_E.w + 'x' + OFFICE_E.h });
      K.storeE = cr('room', STORE_E, { shapeKey: 'R' + STORE_E.w + 'x' + STORE_E.h });
      C.createDoor({ roomId: K.cab.roomId, connects: [K.cab.roomId, K.ring.roomId], side: 's', span: 2, theme: 'cabaret', tiles: CSOUTH });
      C.createDoor({ roomId: K.cab.roomId, connects: [K.cab.roomId, K.ring.roomId], side: 'e', span: 2, theme: 'cabaret', tiles: CEAST });
      C.createDoor({ roomId: K.cab.roomId, connects: [K.cab.roomId, K.spine.roomId], side: 'w', span: 1, theme: 'cabaret', tiles: [CWEST] });
      C.createDoor({ roomId: K.guard.roomId, connects: [K.guard.roomId, K.ring.roomId], side: 'n', span: 1, theme: null, tiles: [GDOOR] });
      C.createDoor({ roomId: K.hall.roomId, connects: [K.hall.roomId, K.ring.roomId], side: 'n', span: 2, theme: null, tiles: GATE });
      C.createDoor({ roomId: K.easthall.roomId, connects: [K.easthall.roomId, K.ring.roomId], side: 'w', span: 2, theme: null, tiles: EHDOOR });
      C.createDoor({ roomId: K.officeE.roomId, connects: [K.officeE.roomId, K.easthall.roomId], side: 's', span: 1, theme: null, tiles: [ODOOR] });
      C.createDoor({ roomId: K.storeE.roomId, connects: [K.storeE.roomId, K.easthall.roomId], side: 'n', span: 1, theme: null, tiles: [SDOOR] });
    }
    // ── stamp — the same writers in the same order as floor 1's (a door() replaces the whole tile, so order is load-bearing) ── [REF#DG-02314]
    const cell = (id) => ({ type: 'floor', roomId: id, segmentId: 0, room: true });
    const rect = (r, id) => { for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.h; z++) { at(x, z); map[x][z] = cell(id != null ? id : r.id); } };
    for (const r of RUNS) rect(r, RING.id);
    rect(DRESS); rect(MGR); rect(SPINE); rect(CAB);
    for (let x = SPINE.x; x < CAB.x + CAB.w; x++) for (let z = CAB.z - 2; z < CAB.z; z++) map[x][z] = { type: 'wall' };   // the stage band's two rock rows [REF#DG-02315]
    rect(HALL); rect(GUARD);
    rect(EASTHALL); rect(OFFICE_E); rect(STORE_E);
    for (let z = GUARD.z; z < GUARD.z + L.counterRows; z++) {   // the counter: the 番所's west column, northern rows, facing hallway 0 [REF#DG-02316]
      const c = at(GUARD.x, z);
      if (c.type !== 'floor' || c.roomId !== GUARD.id) throw new Error('Section0 core: COUNTER seat ' + GUARD.x + ',' + z + ' is not 番所 floor');
      if (at(GUARD.x - 1, z).roomId !== HALL.id) throw new Error('Section0 core: COUNTER at ' + GUARD.x + ',' + z + ' does not face the hall');
      c.counterWall = true; c.counterSide = 'W';
    }
    const door = (t, id) => { at(t[0], t[1]); map[t[0]][t[1]] = { type: 'shoji_door', roomId: id, segmentId: 0 }; };
    for (const d of GATE) door(d, HALL.id);
    for (const d of CSOUTH) door(d, CAB.id);
    for (const d of CEAST) door(d, CAB.id);
    door(CWEST, CAB.id);
    door(NDOOR, CAB.id);
    Object.assign(map[NDOOR[0]][NDOOR[1]], { staff: 'manager' });
    for (const t of L.backstage) { const p = P(t); map[p[0]][p[1]] = cell(SPINE.id); }
    door(DEAST, DRESS.id); door(MWEST, MGR.id);
    door(NECK, SPINE.id);
    Object.assign(map[DEAST[0]][DEAST[1]], { sign: '楽屋', signEn: 'DRESSING ROOM', lockedBy: 'dressing', locked: false });
    Object.assign(map[MWEST[0]][MWEST[1]], { sign: '支配人室', signEn: "MANAGER'S OFFICE", lockedBy: 'manager', locked: true });
    door(GDOOR, GUARD.id);
    for (const d of EHDOOR) door(d, EASTHALL.id);
    door(ODOOR, OFFICE_E.id); door(SDOOR, STORE_E.id);
    if (gsec !== 0) for (let x = GUARD.x; x < GUARD.x + GUARD.w; x++) for (let z = GUARD.z; z < GUARD.z + GUARD.h; z++) {
      const c = map[x][z]; if (!c || c.type === 'wall' || c.roomId !== GUARD.id) continue;
      c.segmentId = (global._sectionSegZero === true) ? 0 : gsec; c.sectionIndex = gsec;
    }
    for (let z = EASTHALL.z; z < EASTHALL.z + EASTHALL.h; z++) {
      const c = map[EASTHALL.x + EASTHALL.w - 1][z];
      if (!c || c.type !== 'floor') throw new Error('Section0 core: east hall exit column is not floor');
      c.sectionExit = 1;
    }
    // the way down: floor 1's 番所, or the office (floors 2-6; the office's door carries the 'manager' lock); none on floor 7 [REF#DG-02317]
    let downRoom = null;
    if (o.down === 'guard') { const d = [GUARD.x + GUARD.w - 2, GUARD.z + GUARD.h - 1]; map[d[0]][d[1]] = { type: 'stairs_down', roomId: GUARD.id, segmentId: gsec, sectionIndex: gsec }; downRoom = 'guard'; out.down = d; }
    else if (o.down === 'office' && L.downOffice) { const d = P(L.downOffice); if (at(d[0], d[1]).roomId !== MGR.id) throw new Error('Section0 core: the office stairs are not in the office'); map[d[0]][d[1]] = { type: 'stairs_down', roomId: MGR.id, segmentId: 0 }; downRoom = 'office'; out.down = d; }
    const UP = P(L.stairs.up), UPR = P(L.stairs.upR);
    map[UP[0]][UP[1]] = { type: 'stairs_up', roomId: HALL.id, segmentId: 0 };
    map[UPR[0]][UPR[1]] = { type: 'stairs_up_r', roomId: HALL.id, segmentId: 0 };
    // ── records (the caller places them at index = id) ── [REF#DG-02318]
    const rec = (r, extra) => Object.assign({ id: r.id, roomId: r.id, x: r.x, y: r.z, w: r.w, h: r.h,
      cx: r.x + (r.w >> 1), cz: r.z + (r.h >> 1), center: { x: r.x + r.w / 2, y: r.z + r.h / 2 },
      segmentId: 0, section: 0, sectionIndex: 0 }, extra);
    const K = out.creator, cid = (k) => (K[k] ? K[k].roomId : null);
    const Q = (t) => P(t);
    out.records = [
      rec(HALL, { roomType: 'hallway', roomName: '入口', roomNameEn: 'Main Hall', isEntranceHall: true, isMainHall: true, depthHops: 0, creatorId: cid('hall') }),
      rec(CAB, { roomType: 'cabaret', roomName: 'キャバレー', roomNameEn: 'Cabaret', isCabaret: true, wallStyle: 'cabaret', depthHops: 2, creatorId: cid('cab') }),
      rec(SPINE, { roomType: 'hallway', roomName: '西回廊', roomNameEn: 'West Corridor', wallStyle: 'mainHall', depthHops: 3, creatorId: cid('spine') }),
      rec(DRESS, { roomType: 'dressing', roomName: '楽屋', roomNameEn: "Starlette's Dressing Room", isDressingRoom: true, wallStyle: 'dungeon', depthHops: 4, creatorId: cid('dress') }),
      rec(MGR, Object.assign({ roomType: 'manager', roomName: '支配人室', roomNameEn: "Manager's Office", isManagerOffice: true, wallStyle: 'dungeon', depthHops: 4, creatorId: cid('mgr') },
        downRoom === 'office' ? { hasStairsDown: true } : {})),
      rec(RING, { roomType: 'hallway', roomName: '回廊', roomNameEn: 'Section 0 Ring', wallStyle: 'mainHall', depthHops: 1, creatorId: cid('ring') }),
      rec(GUARD, Object.assign({ roomType: 'guard', roomName: '番所', roomNameEn: 'GUARDPOST' }, downRoom === 'guard' ? { hasStairsDown: true } : {}, {
        isGuardRoom: true, section: gsec, sectionIndex: gsec, segmentId: gsec, wallStyle: 'guard', depthHops: 1, creatorId: cid('guard') })),
      rec(EASTHALL, { roomType: 'hallway', roomName: '東回廊', roomNameEn: 'East Passage', wallStyle: 'mainHall', depthHops: 3, isSectionExit: true, creatorId: cid('easthall') }),
      rec(OFFICE_E, { roomType: 'room', roomName: '帳場', roomNameEn: 'Counting Room', wallStyle: 'dungeon', depthHops: 4, creatorId: cid('officeE') }),
      rec(STORE_E, (o.konbini === false)
        ? { roomType: 'room', roomName: '物置', roomNameEn: 'Storeroom', wallStyle: 'dungeon', depthHops: 4, creatorId: cid('storeE') }
        : { roomType: 'store', roomName: 'コンビニ', roomNameEn: '7-Eternal', isStore: true, bossInside: true, wallStyle: 'dungeon', depthHops: 4, creatorId: cid('storeE'),
            storeQueue: L.storeQueue.map(Q),
            konbiniLayout: { keeper: Q(L.konbini.keeper), memorial: L.konbini.memorial.map(Q), priced: L.konbini.priced.map(Q),
                             magic: L.konbini.magic.map(Q), drinks: Q(L.konbini.drinks) } }),
    ];
    // ── what the caller joins to: the three section gates (outside the core, on the legs floor 1 uses) ── [REF#DG-02320]
    out.gates = {};
    for (const k of Object.keys(L.gates)) out.gates[k] = { tiles: L.gates[k].tiles.map(P), side: L.gates[k].side };
    out.spawn = P(L.spawn); out.stairs = { up: UP, upR: UPR }; out.gdoor = GDOOR;
    const F = s0Footprint(L); out.footprint = { x0: F.x0 + ox, z0: F.z0 + oz, x1: F.x1 + ox, z1: F.z1 + oz };
    return out;
  }

  function expect() {
    return { doorTiles: CSOUTH.concat(CEAST, [CWEST, GDOOR]),
             opening: CSOUTH.slice(), cabaretDoor: CSOUTH.slice(),
             stairs: [STAIRS.up, STAIRS.upR], spawn: [SPAWN.x, SPAWN.z],
             cabaretRect: CAB, entranceRect: HALL, guardRect: GUARD };
  }

  const API = { generateDungeonMap, expect, setMapSeed: function () {}, buildSection0Core, s0Footprint, S0_LAYOUT_F1, S0_LAYOUT_PLUS10 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Section0 = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
