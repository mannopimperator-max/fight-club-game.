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
 // Seed before the app starts. An already running page's autosave can overwrite
 // a fixture while a slow production reload is still waiting for its response.
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('qa-body-fixture'))return;
  localStorage.setItem('fightclub_demo_v1',JSON.stringify({coins:21398,total:45000,hits:451,power:21,auto:10,skin:'medium',hairColor:'black',bodyType:'athletic'}));
  sessionStorage.setItem('qa-body-fixture','1');
 });
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('.nav button[data-tab="locker"]').click();
 assert.equal(await page.locator('#bodyType-options button').count(),15);
 const unique=new Set();
 for(const [id,p]of Object.entries(profiles)){
  await page.locator('#bodyType-options button').filter({hasText:p.label}).click();
  for(const view of ['front','back']){
   await page.locator('#preview-'+view).click();
   const check=await page.locator('canvas.pixel-preview').evaluate(async(cv,{id,view})=>{
    const image=new Image();image.src=`assets/bodies/${id}-${view}-v8.png`;await image.decode();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const expected=document.createElement('canvas');expected.width=192;expected.height=420;expected.getContext('2d').drawImage(image,0,0);
    const a=cv.getContext('2d').getImageData(0,0,192,420).data,b=expected.getContext('2d').getImageData(0,0,192,420).data;
    let difference=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>2)difference++;
    return {difference,data:cv.toDataURL()};
   },{id,view});
   assert.ok(check.difference<10,`Selected ${id}/${view} must render the approved PNG instead of another body (${check.difference} pixel channels differ)`);
   unique.add(createHash('sha256').update(check.data).digest('hex'));
  }
 }
 assert.equal(unique.size,20);
 await page.reload({waitUntil:'networkidle'});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fightclub_demo_v1')));
 assert.equal(saved.bodyType,'worn');assert.ok(saved.coins>=21398);assert.equal((saved.coins-21398)%10,0);assert.equal(saved.power,21);assert.equal(saved.auto,10);assert.equal(saved.hits,451);
 await page.locator('.nav button[data-tab="locker"]').click();
 assert.equal(await page.locator('#bodyType-options button.selected').innerText(),profiles.worn.label);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 console.log('PASS: 15 choices, all 20 approved PNGs render exactly, new selection persists, old coins/power/auto/hits stay intact, no missing assets or JS errors.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
