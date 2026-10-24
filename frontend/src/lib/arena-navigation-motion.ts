const sections = ["/", "/player", "/tier", "/brawlers", "/companion"]
const mobileSections = ["/", "/brawlers", "/player", "/tier", "/companion"]

function section(path: string, order: string[]) {
  if (/^\/(modes|maps)(\/|$)/.test(path)) return order.indexOf("/tier")
  return order.findIndex(root => root === "/" ? path === "/" : path === root || path.startsWith(`${root}/`))
}

function depth(path: string) {
  return path.split("/").filter(Boolean).length + (/^\/(modes|maps)(\/|$)/.test(path) ? 1 : 0)
}

export function navigationDirection(from: string, to: string, mode: "push" | "replace" | "pop", mobile = false) {
  if (from === to) return "none"
  const order = mobile ? mobileSections : sections
  const previous = section(from, order), next = section(to, order)
  if (previous >= 0 && next >= 0 && previous !== next) return next > previous ? "forward" : "backward"
  if (depth(from) !== depth(to)) return depth(to) > depth(from) ? "forward" : "backward"
  return mode === "pop" ? "backward" : "forward"
}

type IndicatorRect = { x: number; y: number; width: number; height: number }

// FLIP: set the final box immediately, then animate only its visual transform.
// The previous box may be mid-animation, so rapid selections remain continuous.
export function indicatorKeyframes(previous: IndicatorRect, next: IndicatorRect) {
  if ([previous, next].some(rect => ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0)) return null
  return [
    { transform: `translate(${previous.x - next.x}px, ${previous.y - next.y}px) scale(${previous.width / next.width}, ${previous.height / next.height})` },
    { transform: "translate(0px, 0px) scale(1, 1)" },
  ]
}
