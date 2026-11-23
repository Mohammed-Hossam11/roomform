import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialProject, newFurniture, normalizeProject } from '../src/model.ts'
import { bounds, clampInside, inside, overlaps, warnings, WALL_INSET } from '../src/geometry.ts'

const room=initialProject()
const assertInterior=(item)=>{
  assert.ok(inside(item,room),`${item.name} must be inside the wall faces`)
  const b=bounds(item)
  assert.ok(b.minX>=WALL_INSET-.001 && b.minY>=WALL_INSET-.001)
  assert.ok(b.maxX<=520-WALL_INSET+.001 && b.maxY<=320-WALL_INSET+.001)
}

test('bed stops at each interior wall face',()=>{
  const bed=newFurniture('bed',260,160)
  for(const [x,y] of [[-100,160],[800,160],[260,-100],[260,800]]){
    const fitted=clampInside({...bed,x,y},room)
    assert.ok(fitted)
    assertInterior(fitted)
    const b=bounds(fitted)
    if(x<0)assert.ok(Math.abs(b.minX-WALL_INSET)<.001)
    if(x>520)assert.ok(Math.abs(b.maxX-(520-WALL_INSET))<.001)
    if(y<0)assert.ok(Math.abs(b.minY-WALL_INSET)<.001)
    if(y>320)assert.ok(Math.abs(b.maxY-(320-WALL_INSET))<.001)
  }
})

test('rotation near a corner uses all four corners',()=>{
  const wardrobe=newFurniture('wardrobe',110,35)
  const rotated=clampInside({...wardrobe,rotation:45},room)
  assert.ok(rotated)
  assertInterior(rotated)
  assert.ok(rotated.y>wardrobe.y)
})

test('desk resize at the top wall cannot pass through it',()=>{
  const desk=newFurniture('desk',150,35)
  const resized=clampInside({...desk,depth:100},room)
  assert.ok(resized)
  assertInterior(resized)
  assert.equal(bounds(resized).minY,WALL_INSET)
})

test('45 degree custom furniture rejects an impossible footprint',()=>{
  const custom=newFurniture('custom',260,160)
  assertInterior(clampInside({...custom,rotation:45},room))
  assert.equal(clampInside({...custom,width:390,depth:280,rotation:45},room),null)
})

test('rugs may overlap furniture but stay inside the wall',()=>{
  const rug=clampInside(newFurniture('rug',260,160),room)
  const bed=clampInside(newFurniture('bed',260,160),room)
  assert.ok(rug && bed && overlaps(rug,bed))
  assert.deepEqual(warnings(rug,[rug,bed],room),[])
  assert.ok(!warnings(bed,[bed,rug],room).some(s=>s.includes('Overlaps')))
  assertInterior(clampInside({...rug,x:-100},room))
  const circle=clampInside({...rug,rugShape:'circle',width:160,depth:160,rotation:45,x:-100},room)
  assert.ok(circle)
  assert.equal(bounds(circle).minX,WALL_INSET)
})

test('old saved and imported projects are normalized across every layout',()=>{
  const old=initialProject()
  for(const layout of old.layouts){delete layout.appearance;layout.furniture[0].x=-100;layout.furniture[0].y=-100}
  const repaired=normalizeProject(old)
  for(const layout of repaired.layouts){assert.ok(layout.appearance);for(const item of layout.furniture)assertInterior(item)}
  const imported=normalizeProject(old,true)
  for(const layout of imported.layouts)for(const item of layout.furniture)assertInterior(item)
  imported.layouts[0].furniture[0].width=900
  assert.throws(()=>normalizeProject(imported,true),/too large/)
})
