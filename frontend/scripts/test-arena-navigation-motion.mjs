import assert from "node:assert/strict"
import { build } from "esbuild"

const output = await build({ entryPoints: ["src/lib/arena-navigation-motion.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { navigationDirection: direction, indicatorKeyframes: frames } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)

assert.equal(direction("/", "/companion", "push"), "forward")
assert.equal(direction("/companion", "/player", "push"), "backward")
assert.equal(direction("/tier", "/brawlers", "pop"), "forward", "Tab positions define direction even when going forward in browser history")
assert.equal(direction("/brawlers/amber", "/brawlers", "push"), "backward")
assert.equal(direction("/tier", "/modes", "push"), "forward")
assert.equal(direction("/maps/beach-ball", "/tier", "push"), "backward")
assert.equal(direction("/modes", "/maps", "pop"), "backward")
assert.equal(direction("/player", "/player", "push"), "none", "Query-only updates preserve the current screen")
assert.equal(direction("/tier", "/brawlers", "push", true), "backward", "Mobile direction follows the bottom bar, whose order differs from desktop")
assert.equal(direction("/brawlers", "/player", "push", true), "forward")
assert.equal(direction("/maps/beach-ball", "/brawlers", "pop", true), "backward")

const old = { x: 20, y: 5, width: 90, height: 42 }
const next = { x: 180, y: 5, width: 120, height: 42 }
assert.deepEqual(frames(old, next), [
  { transform: "translate(-160px, 0px) scale(0.75, 1)" },
  { transform: "translate(0px, 0px) scale(1, 1)" },
])
assert.equal(frames(next, old)[0].transform, "translate(160px, 0px) scale(1.3333333333333333, 1)")
assert.equal(frames({ ...old, x: 120, width: 105 }, next)[0].transform, "translate(-60px, 0px) scale(0.875, 1)", "An interrupted glide starts at its measured intermediate box")
assert.equal(frames(old, { ...next, width: 0 }), null, "Hidden/responsive navigation must not create infinite scale")
assert.equal(frames({ ...old, x: NaN }, next), null)
// Real DOMRect properties can be getters on the prototype, not enumerable keys.
const domRect = Object.create({ x: 20, y: 5, width: 90, height: 42 })
assert.deepEqual(frames(domRect, next), frames(old, next))
assert.equal(frames(Object.create({ ...old, x: Infinity }), next), null)
console.log("PASS: tab and hierarchy directions, same-route updates, forward/reverse indicator geometry, interruption continuity, DOMRect getters and hidden navigation")
