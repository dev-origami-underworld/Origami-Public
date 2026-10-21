# The DUNGEON realm's textures

These are the photo textures for the Invading Realms' DUNGEON theme (`js/v8/data/RealmThemes.js`). Each one comes from
[Poly Haven](https://polyhaven.com) under **CC0** (public domain), so no attribution is required. They are credited here anyway.

| file | what it dresses | Poly Haven asset | author |
| --- | --- | --- | --- |
| `wall.jpg` | realm walls | [medieval_blocks_03](https://polyhaven.com/a/medieval_blocks_03) | Rob Tuytel |
| `floor.jpg` | realm floor, one copy per 2 m tile | [grey_stone_path](https://polyhaven.com/a/grey_stone_path) | Amal Kumar |
| `ceiling.jpg` | realm ceiling | [seaside_rock](https://polyhaven.com/a/seaside_rock) | Dimitrios Savva |
| `door.jpg` | the open doors at realm doorways | [wood_trunk_wall](https://polyhaven.com/a/wood_trunk_wall) planks, with iron straps, rivets and a ring painted from [rust_coarse_01](https://polyhaven.com/a/rust_coarse_01) | Amal Kumar (planks) · Dimitrios Savva, Rico Cilliers (rust) |
| `urn.jpg` | the realm's clay urns | [red_plaster_weathered](https://polyhaven.com/a/red_plaster_weathered) | Amal Kumar |

Every file is the 1k diffuse map, re-encoded as JPEG (q85, progressive) at 1024×1024.
- **The door** is the plank map darkened ×0.90. Two iron straps, ten rivets per strap and a ring pull are painted over it.
- **Normal maps ship beside each photo** since 2026-10-02 (`wall_nor.jpg`, `floor_nor.jpg`, `ceiling_nor.jpg`, `door_nor.jpg`, `urn_nor.jpg`): the
  same Poly Haven sets as the photos above (the wall's is medieval_blocks_03's, the door's the plank map's), OpenGL convention, linear, re-encoded
  at q82. The roughness maps are still not shipped.

Made 2026-10-01 for the REALM PORTAL work (the DISABLED-FEATURES REGISTER entry in `Origami.RealityEngine.9.html`).
