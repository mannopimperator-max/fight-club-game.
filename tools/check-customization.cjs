const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const profiles=require('./body-types.json');
const base=process.env.GAME_URL||'http://127.0.0.1:8081/';
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)missing.push(r.url())});
 await page.route('**/telegram.org/**',r=>r.abort());
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('qa-customization-fixture'))return;
  localStorage.setItem('fightclub_demo_v1',JSON.stringify({coins:10000,hits:123,total:4567,power:3,bodyType:'athletic',ownedEquipment:['top_box_red'],equippedEquipment:{top:'top_box_red'},ownedTattoos:['dragon_left'],equippedTattoos:{leftArm:'dragon_left'}}));
  sessionStorage.setItem('qa-customization-fixture','1');
 });
 await page.goto(base,{waitUntil:'networkidle'});
 const silhouettes=await page.evaluate(async()=>{
  const results=[];
  for(const body of ['wide','heavyweight']){
   const image=new Image();image.src=`assets/bodies/${body}-front-v71.png`;await image.decode();
   const cv=document.createElement('canvas');cv.width=image.width;cv.height=image.height;
   const c=cv.getContext('2d');c.drawImage(image,0,0);const data=c.getImageData(0,0,cv.width,cv.height).data;
   let last=null,run=0,longest=0,left=cv.width,right=0;
   for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)if(data[(y*cv.width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x)}
   for(let y=90;y<226;y++){
    let edge=null;for(let x=0;x<60;x++)if(data[(y*cv.width+x)*4+3]>128){edge=x;break}
    run=edge===last?run+1:1;longest=Math.max(longest,run);last=edge;
   }
   results.push({body,width:cv.width,height:cv.height,left,right,longest});
  }return results;
 });
 for(const result of silhouettes){
  assert.equal(result.width,192);assert.equal(result.height,420);
  assert.ok(result.left>0&&result.right<191,'The full silhouette needs transparent margins: '+result.body);
  assert.ok(result.longest<=20,'The arm contour must not have a flat cropped side: '+result.body);
 }
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fightclub_demo_v1')));
 assert.equal((await state()).hits,123);assert.equal((await state()).power,3);
 await page.locator('.nav button[data-tab="locker"]').click();
 const buy=async(root,title)=>{const card=page.locator(root+' .item-card').filter({has:page.getByText(title,{exact:true})});await card.locator('button').click();};
 await buy('#equipment-shop','Майка · Синий');
 let saved=await state();assert.equal(saved.equippedEquipment.top,'top_v7_blue');assert.equal(saved.coins,9820);assert.ok(saved.ownedEquipment.includes('top_box_red'));
 await page.locator('#equipment-tabs button').filter({hasText:'Низ'}).click();await buy('#equipment-shop','Шорты · Изумрудный');
 await page.locator('#equipment-tabs button').filter({hasText:'Перчатки'}).click();await buy('#equipment-shop','Перчатки · Красный');
 // Wait for actual textures and their scheduled repaint, including on a cold CDN.
 await page.evaluate(async()=>{
  await Promise.all(['top-blue.png','bottom-green.png','gloves-red.png?v=72'].map(async name=>{const image=new Image();image.src='assets/equipment/athletic/front/'+name;await image.decode()}));
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
 });
 const gloveHash=async()=>createHash('sha256').update(await page.locator('#pixel-fighter').evaluate(cv=>cv.toDataURL())).digest('hex');
 const gloveBeforeWrap=await gloveHash();
 await page.locator('#accessory-tabs button').filter({hasText:'Бинты'}).click();await buy('#accessory-shop','Пиксельные бинты — базовые');
 await page.waitForLoadState('networkidle');
 assert.equal(await gloveHash(),gloveBeforeWrap,'Wraps and their finger pixels must stay inside boxing gloves');
 await page.locator('#accessory-tabs button').filter({hasText:'Обувь'}).click();await buy('#accessory-shop','Боксёрки · Золотой');
 await page.locator('#tattoo-tabs button').filter({hasText:'Спина'}).click();await buy('#tattoo-shop','Дракон на спине');
 saved=await state();assert.equal(saved.equippedTattoos.back,'dragon_back');assert.equal(saved.previewBack,true);assert.equal(saved.coins,8350);
 await page.locator('#preview-front').click();
 const renders=[];
 const bodies={athletic:'Атлетичный',muscular:'Накачанный',lean:'Сухой',wide:'Широкий',heavyweight:'Тяжеловес',...Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,p.label]))};
 assert.equal(await page.locator('#bodyType-options button').count(),15);
 for(const [id,label]of Object.entries(bodies)){
  await page.locator('#bodyType-options button').filter({hasText:label}).click();
  for(const view of ['front','back']){
   await page.locator('#preview-'+view).click();
   await page.evaluate(async({id,view})=>{
    const files=['top-blue.png','bottom-green.png','gloves-red.png?v=72','feet-gold.png'];
    const urls=files.map(file=>`assets/equipment/${id}/${view}/${file}`);
    if(window.FIGHT_CLUB_BODY_CATALOG[id])urls.push(FIGHT_CLUB_BODY_CATALOG[id][view].src);
    await Promise.all(urls.map(async src=>{const image=new Image();image.src=src;await image.decode()}));
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   },{id,view});
   const render=await page.locator('canvas.pixel-preview').evaluate(cv=>{const d=cv.getContext('2d').getImageData(0,0,192,420).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return {pixels:n,data:cv.toDataURL()}});
   assert.ok(render.pixels>5000,label+' '+view);renders.push(render.data);
  }
 }
 assert.equal(new Set(renders).size,30,'Each body/view needs its own rendered sprite');
 await page.reload({waitUntil:'networkidle'});saved=await state();assert.equal(saved.equippedEquipment.top,'top_v7_blue');assert.equal(saved.equippedAccessories.feet,'shoes_v7_gold');assert.equal(saved.equippedTattoos.back,'dragon_back');assert.equal(saved.hits,123);assert.equal(saved.power,3);
 assert.equal(saved.bodyType,'worn','The last new body selection must survive a reload');
 await page.locator('.nav button[data-tab="locker"]').click();await page.locator('#preview-front').click();await page.locator('#equipment-tabs button').filter({hasText:'Верх'}).click();await buy('#equipment-shop','Без верха');
 assert.equal((await state()).equippedEquipment.top,'top_none');
 await page.locator('#tattoo-tabs button').filter({hasText:'Грудь'}).click();await buy('#tattoo-shop','Тигр');
 await page.locator('#locker-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/fight-club-mobile-v7.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 console.log('PASS: complete arm contours, transparent margins, purchases, exact prices, wraps under gloves, legacy progress, all 30 body/views, persistence, shirt removal, tattoos, no JS errors or missing assets.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
