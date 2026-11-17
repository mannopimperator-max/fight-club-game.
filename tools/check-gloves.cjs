const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fit=require('./glove-fit.json');
const rigs=require('./body-rig.json');
for(const [id,views]of Object.entries(rigs))fit[id]=Object.fromEntries(Object.entries(views).map(([view,r])=>[view,r.gloves]));
const sources=JSON.parse(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/const pixelSources\s*=\s*(\{[^\n]+\})\s*;/)[1]);
for(const id of Object.keys(rigs))for(const view of ['front','back'])sources[id+'_'+view]=`assets/bodies/${id}-${view}-v8.png`;
const base=process.env.GAME_URL||'http://127.0.0.1:8081/';
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1500,height:1200}});
 await page.route('**/telegram.org/**',r=>r.abort());await page.goto(base,{waitUntil:'networkidle'});
 const results=await page.evaluate(async({fit,sources})=>{
  const load=async(src)=>{const im=new Image();im.src=src;await im.decode();return im};
  const pixels=(im)=>{const cv=document.createElement('canvas');cv.width=192;cv.height=420;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(im,0,0,192,420);return c.getImageData(0,0,192,420).data};
  const board=document.createElement('div');board.style='position:absolute;inset:0;background:#ebe9e4;z-index:999999;display:grid;grid-template-columns:repeat(5,290px);gap:10px;align-content:start;padding:10px;color:#111';const results=[];
  for(const view of ['front','back'])for(const [body,views]of Object.entries(fit)){
   const src=sources[body+'_'+view],base=await load(src.startsWith('assets/')?src:'data:image/png;base64,'+src),raw=pixels(base);
   const image=await load(`assets/equipment/${body}/${view}/gloves-red.png?v=72`),p=pixels(image);
   const alpha=[];for(let n=3;n<p.length;n+=4)alpha.push(p[n]);
   for(const color of ['black','blue','green','white','gold','purple','orange']){
    const variant=pixels(await load(`assets/equipment/${body}/${view}/gloves-${color}.png?v=72`));
    if(alpha.some((a,n)=>a!==variant[n*4+3]))throw Error(`Color changes fit: ${body}/${view}/${color}`);
   }
   const hands=views[view].map((hand,n)=>{
    const [wx,wy]=hand.wrist,[kx,ky]=hand.knuckles;
    let total=0,covered=0,above=0,below=0,cuffX=0,cuffY=0,white=0;
    for(let y=ky-7;y<ky+10;y++)for(let x=kx-12;x<=kx+12;x++){
     const i=(y*192+x)*4,r=raw[i],g=raw[i+1],b=raw[i+2];
     const seam=Math.min(r,g,b)>128&&Math.max(r,g,b)-Math.min(r,g,b)<60;
     if(raw[i+3]>128&&r>70&&r>g*1.1&&g>b*1.04&&!seam){total++;if(p[i+3]>128)covered++}
    }
    for(let y=Math.max(0,wy-15);y<Math.min(420,ky+40);y++)for(let x=n===0?0:96;x<(n===0?96:192);x++){
     const i=(y*192+x)*4;if(p[i+3]<128)continue;
     if(y<wy)above++;else below++;
     if(p[i]>145&&p[i+1]>140&&p[i+2]>130){white++;cuffX+=x+.5;cuffY+=y+.5}
    }
    return {coverage:covered/total,wristAlpha:p[(wy*192+wx)*4+3],knuckleAlpha:p[(ky*192+kx)*4+3],belowRatio:below/Math.max(1,above),cuffDistance:white?Math.hypot(cuffX/white-wx,cuffY/white-wy):null};
   });
   let border=0;for(let y=0;y<420;y++)border+=p[(y*192)*4+3]+p[(y*192+191)*4+3];
   results.push({body,view,hands,border});
   const cell=document.createElement('div');cell.innerHTML=`<b>${body} · ${view}</b>`;
   const cv=document.createElement('canvas');cv.width=192;cv.height=420;cv.style='width:192px;display:block;margin:auto;image-rendering:pixelated';const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(base,0,0,192,420);c.drawImage(image,0,0);
   const zoom=document.createElement('canvas');zoom.width=288;zoom.height=120;const z=zoom.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(cv,0,180,192,80,0,0,288,120);
   cell.append(cv,zoom);board.append(cell);
  }document.body.append(board);return results;
 },{fit,sources});
 await page.screenshot({path:'/tmp/glove-calibration-v72.png',fullPage:true});
 for(const result of results){
  assert.equal(result.border,0,`No clipping: ${result.body}/${result.view}`);
  for(const hand of result.hands){
   assert.ok(hand.coverage>=.995,`Bare knuckles show through: ${JSON.stringify(result)}`);
   assert.ok(hand.wristAlpha>128&&hand.knuckleAlpha>128,`Glove floats off hand: ${JSON.stringify(result)}`);
   assert.ok(hand.belowRatio>2,`Glove must hang below its cuff: ${JSON.stringify(result)}`);
   if(result.view==='front')assert.ok(hand.cuffDistance<2,`Cuff must attach to wrist: ${JSON.stringify(result)}`);
  }
 }
 console.log('PASS: 60 wrists/knuckles, cuff orientation, palm coverage, no clipping, identical fit across all eight colors.');
 console.log(JSON.stringify(results.map(v=>({body:v.body,view:v.view,coverage:v.hands.map(h=>+h.coverage.toFixed(3))}))));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
