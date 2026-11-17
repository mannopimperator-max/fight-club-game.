// Package the approved artwork without changing anatomy or stretching it.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const profiles=require('./body-types.json');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 for(const [id,profile]of Object.entries(profiles)){
  const src='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'body-source',profile.source)).toString('base64');
  const sprites=await page.evaluate(async(src)=>{
   const img=new Image();img.src=src;await img.decode();
   const raw=document.createElement('canvas');raw.width=img.width;raw.height=img.height;
   const r=raw.getContext('2d',{willReadFrequently:true});r.drawImage(img,0,0);
   const d=r.getImageData(0,0,raw.width,raw.height),p=d.data;
   // Remove imperceptible background alpha noise produced by PNG extraction.
   for(let n=3;n<p.length;n+=4)if(p[n]<16)p[n]=0;
   r.putImageData(d,0,0);const out={};
   for(let n=0;n<2;n++){
    const x0=n*raw.width/2,x1=(n+1)*raw.width/2;
    let left=x1,right=x0,bottom=0;
    for(let y=0;y<raw.height;y++)for(let x=x0;x<x1;x++)if(p[(y*raw.width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1)}
    // One shared pixel scale preserves the approved relative heights.
    const scale=.32,cv=document.createElement('canvas');cv.width=192;cv.height=420;
    const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
    c.drawImage(raw,x0,0,x1-x0,raw.height,96-((left+right)/2-x0)*scale,390-bottom*scale,(x1-x0)*scale,raw.height*scale);
    out[n===0?'front':'back']=cv.toDataURL('image/png').split(',')[1];
   }return out;
  },src);
  for(const [view,data]of Object.entries(sprites))fs.writeFileSync(path.join(root,'assets/bodies',`${id}-${view}-v8.png`),Buffer.from(data,'base64'));
 }
 await browser.close();console.log('Packaged 20 approved body views at 192 x 420.');
})().catch(e=>{console.error(e);process.exit(1)});
