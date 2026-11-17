const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.GAME_URL||'http://127.0.0.1:8081/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)missing.push(r.url())});
 await page.route('**/telegram.org/**',r=>r.abort());
 await page.goto(base,{waitUntil:'networkidle'});
 await page.evaluate(()=>localStorage.setItem('fightclub_demo_v1',JSON.stringify({coins:10000,hits:123,total:4567,power:3,bodyType:'athletic',ownedEquipment:['top_box_red'],equippedEquipment:{top:'top_box_red'},ownedTattoos:['dragon_left'],equippedTattoos:{leftArm:'dragon_left'}})));
 await page.reload({waitUntil:'networkidle'});
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fightclub_demo_v1')));
 assert.equal((await state()).hits,123);assert.equal((await state()).power,3);
 await page.locator('.nav button[data-tab="locker"]').click();
 const buy=async(root,title)=>{const card=page.locator(root+' .item-card').filter({has:page.getByText(title,{exact:true})});await card.locator('button').click();};
 await buy('#equipment-shop','Майка · Синий');
 let saved=await state();assert.equal(saved.equippedEquipment.top,'top_v7_blue');assert.equal(saved.coins,9820);assert.ok(saved.ownedEquipment.includes('top_box_red'));
 await page.locator('#equipment-tabs button').filter({hasText:'Низ'}).click();await buy('#equipment-shop','Шорты · Изумрудный');
 await page.locator('#equipment-tabs button').filter({hasText:'Перчатки'}).click();await buy('#equipment-shop','Перчатки · Красный');
 await page.locator('#accessory-tabs button').filter({hasText:'Обувь'}).click();await buy('#accessory-shop','Боксёрки · Золотой');
 await page.locator('#tattoo-tabs button').filter({hasText:'Спина'}).click();await buy('#tattoo-shop','Дракон на спине');
 saved=await state();assert.equal(saved.equippedTattoos.back,'dragon_back');assert.equal(saved.previewBack,true);assert.equal(saved.coins,8350);
 await page.locator('#preview-front').click();
 const renders=[];
 for(const label of ['Атлетичный','Накачанный','Сухой','Широкий','Тяжеловес']){
  await page.locator('#bodyType-options button').filter({hasText:label}).click();
  for(const view of ['front','back']){
   await page.locator('#preview-'+view).click();await page.waitForTimeout(160);
   const render=await page.locator('canvas.pixel-preview').evaluate(cv=>{const d=cv.getContext('2d').getImageData(0,0,192,420).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return {pixels:n,data:cv.toDataURL()}});
   assert.ok(render.pixels>12000,label+' '+view);renders.push(render.data);
  }
 }
 assert.equal(new Set(renders).size,10,'Each body/view needs its own rendered sprite');
 await page.reload({waitUntil:'networkidle'});saved=await state();assert.equal(saved.equippedEquipment.top,'top_v7_blue');assert.equal(saved.equippedAccessories.feet,'shoes_v7_gold');assert.equal(saved.equippedTattoos.back,'dragon_back');assert.equal(saved.hits,123);assert.equal(saved.power,3);
 await page.locator('.nav button[data-tab="locker"]').click();await page.locator('#preview-front').click();await page.locator('#equipment-tabs button').filter({hasText:'Верх'}).click();await buy('#equipment-shop','Без верха');
 assert.equal((await state()).equippedEquipment.top,'top_none');
 await page.locator('#tattoo-tabs button').filter({hasText:'Грудь'}).click();await buy('#tattoo-shop','Тигр');
 await page.locator('#locker-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/fight-club-mobile-v7.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 console.log('PASS: purchases, exact prices, legacy progress, all 10 body/views, persistence, shirt removal, tattoos, no JS errors or missing assets.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
