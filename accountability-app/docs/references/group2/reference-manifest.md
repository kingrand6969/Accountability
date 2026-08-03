# Group 2 Approved Reference Manifest

Canonical source:

- File: `group2-approved-four-panel.png`
- Dimensions: `1121 × 682`
- SHA-256: `EDF6514B44A6566C17E075B1EC69F6E9BFE2A8CEEA1EF15ADE0EC06D2924CC4F`
- Source: product-owner-provided approved four-panel image

Provenance panel crop rectangles use `x, y, width, height`. These retain the
panel title, phone bezel, and surrounding background and must not be used for
candidate overlays:

| Reference ID | Crop |
|---|---|
| `ENTRY-WELCOME-01` | `0, 0, 280, 682` |
| `PROMISE-START-01` | `280, 0, 280, 682` |
| `CREATE-HUB-01` | `560, 0, 280, 682` |
| `SHARE-PROOF-01` | `840, 0, 281, 682` |

App-viewport crop rectangles remove the title, decorative phone frame, and
surrounding background. Geometry comparisons and overlays must use these:

| Reference ID | App viewport crop |
|---|---|
| `ENTRY-WELCOME-01` | `27, 66, 236, 596` |
| `PROMISE-START-01` | `310, 64, 239, 598` |
| `CREATE-HUB-01` | `590, 64, 237, 598` |
| `SHARE-PROOF-01` | `867, 64, 238, 598` |

Do not overwrite, rescale, independently stretch, or silently recrop this
source. Any replacement requires a new checksum and explicit product-owner
approval.
