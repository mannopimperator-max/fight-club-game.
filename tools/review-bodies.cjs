const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const ids=Object.keys(require('./body-types.json'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:2000,height:1020}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/telegram.org/**',r=>r.abort());
 await page.route('**/index.html',async r=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace('const tg=window.Telegram','window.reviewBody={state:()=>s,draw:repaintPixelCanvas};const tg=window.Telegram');
  await r.fulfill({body:html,contentType:'text/html'});
 });
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8081/')+'index.html',{waitUntil:'networkidle'});
 await page.evaluate(async ids=>{
  const board=document.createElement('div');board.style='position:absolute;inset:0;z-index:99999;background:#e6e3dc;color:#222;padding:15px;display:grid;grid-template-columns:repeat(5,384px);gap:10px;align-content:start';
  for(const id of ids){
   const cell=document.createElement('div');cell.style='background:#f5f3ee;border-radius:10px;padding:5px 0;';cell.innerHTML=`<b style="padding:10px;display:block">${FIGHT_CLUB_BODY_CATALOG[id].label} · ${id}</b>`;
   for(const back of [false,true]){
    const s=reviewBody.state();s.bodyType=id;s.activeGear='';s.skin='medium';s.hairColor='black';s.equippedEquipment={top:'top_v7_red',bottom:'bottom_v7_blue',gloves:'glove_pixel_base'};s.equippedAccessories={hands:'wrap_pixel_base',waist:'belt_pixel_base',feet:'shoes_pixel_base'};s.equippedTattoos={};
    await Promise.all(['top-red.png','bottom-blue.png','gloves-red.png?v=72','waist-black.png','feet-black.png'].map(async file=>{const image=new Image();image.src=`assets/equipment/${id}/${back?'back':'front'}/${file}`;await image.decode()}));
    const cv=document.createElement('canvas');cv.dataset.view=back?'back':'normal';reviewBody.draw(cv);const image=new Image();image.src=cv.toDataURL();image.style='width:192px;height:420px;image-rendering:pixelated';cell.append(image);
   }board.append(cell);
  }document.body.append(board);
 },ids);
 await page.screenshot({path:'/tmp/new-bodies-equipped-v8.png',fullPage:true});
 console.log(JSON.stringify({errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
