import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const output = await build({ stdin: { contents: 'export {BrawlerPreviewLink} from "./src/components/brawler-preview-link"; export {renderToStaticMarkup} from "react-dom/server";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false })
const compiled = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports)
const { BrawlerPreviewLink, renderToStaticMarkup } = compiled.exports
let previews = 0
const props = {href:'/brawlers/amber',name:'アンバー',className:'card',children:'アンバー',onPreview:()=>{previews++}}
const link = BrawlerPreviewLink(props)
assert.match(renderToStaticMarkup(link), /<a href="\/brawlers\/amber"/)
assert.match(renderToStaticMarkup(link), /aria-label="アンバーの詳細"/)

function click(overrides = {}) {
  let prevented = false
  link.props.onClick({button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,...overrides,preventDefault:()=>{prevented=true}})
  return prevented
}
assert.equal(click(),true)
assert.equal(previews,1,'ordinary click opens the existing preview')
for (const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]) {
  assert.equal(click(overrides),false,'browser navigation must remain available')
}
assert.equal(previews,1,'modified clicks do not open the preview')
let spacePrevented = false
link.props.onKeyDown({key:' ',preventDefault:()=>{spacePrevented=true}})
assert.equal(spacePrevented,true)
assert.equal(previews,2,'space still opens the preview')
const missing = BrawlerPreviewLink({...props,href:undefined})
assert.equal(missing.type,'button','unavailable analysis pages have no crawlable URL')
missing.props.onClick()
assert.equal(previews,3)
console.log('PASS: crawlable detail link, existing preview, modified clicks, keyboard and unavailable-page fallback')
