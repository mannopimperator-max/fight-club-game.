// Rebuild aligned game textures from the original extracted PNG layers.
// Run with Node and Playwright; CHROMIUM_PATH can select an installed browser.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const layout = require('./gear-layout.json');
const gloveFit = require('./glove-fit.json');
const bodyProfiles=require('./body-types.json');
const bodyRigs=require('./body-rig.json');
for(const [body,views]of Object.entries(bodyRigs)){
  layout[body]=views;
  gloveFit[body]=Object.fromEntries(Object.entries(views).map(([view,rig])=>[view,rig.gloves]));
}
const colors = {
  black:{label:'Графит',hex:'#302d37'}, red:{label:'Красный',hex:'#ba3548'},
  blue:{label:'Синий',hex:'#376bc1'}, green:{label:'Изумрудный',hex:'#2c8668'},
  white:{label:'Белый',hex:'#e4dfd5'}, gold:{label:'Золотой',hex:'#c99a3e'},
  purple:{label:'Фиолетовый',hex:'#8252ad'}, orange:{label:'Оранжевый',hex:'#d97732'}
};
const slots = ['bottom','top','hands','gloves','waist','feet'];
(async()=>{
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('about:blank');
  let count=0;
  for(const [body,views] of Object.entries(layout)) for(const [view,fit] of Object.entries(views)) {
    const sourceBody=bodyProfiles[body]?.gearSource||body;
    const src='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'equipment-source',`${sourceBody}_${view}_gear.png`)).toString('base64');
    const bodySrc=bodyProfiles[body]?'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/bodies',`${body}-${view}-v8.png`)).toString('base64'):null;
    const textures=await page.evaluate(async({src,bodySrc,fit,colors,slots,gloveFit})=>{
      const img=new Image();img.src=src;await img.decode();
      let bodyImage,bodyPixels;
      if(bodySrc){
        bodyImage=new Image();bodyImage.src=bodySrc;await bodyImage.decode();
        const base=document.createElement('canvas');base.width=192;base.height=420;
        const bc=base.getContext('2d');bc.drawImage(bodyImage,0,0);bodyPixels=bc.getImageData(0,0,192,420).data;
      }
      const out={};
      const bounds=(data,x0,x1,y0,y1)=>{
        let l=x1,t=y1,r=x0,b=y0;
        for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*192+x)*4+3]>16){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1)}
        return [l,t,r-l,b-t];
      };
      for(let i=0;i<slots.length;i++){
        const slot=slots[i],raw=document.createElement('canvas');raw.width=192;raw.height=420;
        const r=raw.getContext('2d',{willReadFrequently:true});r.drawImage(img,0,i*420,192,420,0,0,192,420);
        if(slot==='bottom'&&fit.bottomFromBody){
          r.clearRect(0,0,192,420);r.drawImage(bodyImage,0,0);
          const masked=r.getImageData(0,0,192,420),p=masked.data,[l,t,w,h]=fit.bottom;
          for(let y=0;y<420;y++)for(let x=0;x<192;x++){
            const i=(y*192+x)*4,red=p[i],g=p[i+1],b=p[i+2],hi=Math.max(red,g,b),lo=Math.min(red,g,b);
            if(x<l||x>=l+w||y<t||y>=t+h||hi-lo>=60||!(hi<155||lo>128))p[i+3]=0;
          }r.putImageData(masked,0,0);
        }
        const original=r.getImageData(0,0,192,420),parts=['hands','gloves','feet'].includes(slot)?[bounds(original.data,0,96,0,420),bounds(original.data,96,192,0,420)]:[bounds(original.data,0,192,0,420)];
        for(const [key,color] of Object.entries(colors)){
          const rgba=new ImageData(new Uint8ClampedArray(original.data),192,420),p=rgba.data;
          const target=[1,3,5].map(n=>parseInt(color.hex.slice(n,n+2),16));
          for(let n=0;n<p.length;n+=4){
            if(p[n+3]<10)continue;
            const red=p[n],g=p[n+1],b=p[n+2],lum=.26*red+.62*g+.12*b;
            const skin=slot==='hands'&&red>80&&red>g*1.18&&g>b*1.08;
            const trim=lum>139&&Math.max(red,g,b)-Math.min(red,g,b)<65;
            // Retain fingertips, ivory stitching, glove patches, soles and metal buckles.
            if(skin||trim||lum<23)continue;
            const reference=slot==='gloves'?91:46;
            const shade=Math.max(.24,Math.min(1.65,lum/reference));
            for(let k=0;k<3;k++)p[n+k]=Math.min(255,Math.round(target[k]*shade));
          }
          r.putImageData(rgba,0,0);
          const cv=document.createElement('canvas');cv.width=192;cv.height=420;
          const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
          const dest=slot==='gloves'?null:(Array.isArray(fit[slot][0])?fit[slot]:[fit[slot]]);
          if(slot==='gloves'){
            // Turn each glove 180 degrees and exchange source hands so thumbs
            // stay toward the body. Anchor the cuff, not the image rectangle.
            const cuffCenter=([x,y,w,h])=>{
              let sx=0,sy=0,count=0;
              for(let yy=Math.floor(h*.65);yy<h;yy++)for(let xx=0;xx<w;xx++){
                const n=((y+yy)*192+x+xx)*4,p=original.data;
                if(p[n+3]>128&&p[n]>145&&p[n+1]>140&&p[n+2]>130){sx+=xx+.5;sy+=yy+.5;count++}
              }
              return count?[sx/count/w,sy/count/h]:[.5,.85];
            };
            gloveFit.forEach((hand,n)=>{
              const part=parts[1-n],pivot=cuffCenter(part),[w,h]=hand.size;
              const angle=-Math.atan2(hand.knuckles[0]-hand.wrist[0],hand.knuckles[1]-hand.wrist[1]);
              c.save();c.translate(...hand.wrist);c.rotate(angle);
              c.rotate(Math.PI);
              c.drawImage(raw,...part,-pivot[0]*w,-pivot[1]*h,w,h);
              c.restore();
            });
          }else if(slot==='bottom'&&fit.bottomFromBody)c.drawImage(raw,0,0);
          else if(slot==='top'&&fit.topFollowsBody){
            const [sx,sy,sw,sh]=parts[0],[l,t,w,h]=fit.top,cx=fit.anchors.cx;
            for(let row=0;row<h;row++){
              const y=t+row,sourceY=sy+Math.min(sh-1,Math.floor(row/h*sh));
              let sl=sx,sr=sx+sw;
              while(sl<sr&&original.data[(sourceY*192+sl)*4+3]<16)sl++;
              while(sr>sl&&original.data[(sourceY*192+sr-1)*4+3]<16)sr--;
              if(sl===sr)continue;
              let dl=cx,dr=cx;
              while(dl>0&&bodyPixels[(y*192+dl-1)*4+3]>128)dl--;
              while(dr<191&&bodyPixels[(y*192+dr+1)*4+3]>128)dr++;
              dl=Math.max(dl,l);dr=Math.min(dr+1,l+w);
              if(dr>dl)c.drawImage(raw,sl,sourceY,sr-sl,1,dl,y,dr-dl,1);
            }
            c.globalCompositeOperation='destination-in';c.drawImage(bodyImage,0,0);c.globalCompositeOperation='source-over';
          }else parts.forEach((part,n)=>c.drawImage(raw,...part,...dest[n]));
          out[`${slot}-${key}.png`]=cv.toDataURL('image/png').split(',')[1];
        }
      }
      return out;
    },{src,bodySrc,fit,colors,slots,gloveFit:gloveFit[body][view]});
    const dest=path.join(root,'assets/equipment',body,view);fs.mkdirSync(dest,{recursive:true});
    for(const [name,data]of Object.entries(textures)){fs.writeFileSync(path.join(dest,name),Buffer.from(data,'base64'));count++}
  }
  fs.writeFileSync(path.join(root,'assets/equipment/manifest.json'),JSON.stringify({version:'8.0',width:192,height:420,colors,bodies:Object.keys(layout),views:['front','back'],slots,gloveFit,file:'{body}/{view}/{slot}-{color}.png'},null,2)+'\n');
  const flash='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/tattoos/flash.png')).toString('base64');
  const motifs=['tribal','dragon','geo','snake','warrior','eagle','rune','tiger','skull'];
  const decals=await page.evaluate(async({flash,motifs})=>{
    const img=new Image();img.src=flash;await img.decode();const out={};
    for(let n=0;n<9;n++){
      const cell=document.createElement('canvas');cell.width=img.width/3;cell.height=img.height/3;
      const c=cell.getContext('2d');c.drawImage(img,-(n%3)*cell.width,-Math.floor(n/3)*cell.height);
      const d=c.getImageData(0,0,cell.width,cell.height).data;let l=cell.width,t=cell.height,r=0,b=0;
      for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++)if(d[(y*cell.width+x)*4+3]>16){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}
      const cv=document.createElement('canvas');cv.width=r-l+1;cv.height=b-t+1;cv.getContext('2d').drawImage(cell,-l,-t);
      out[motifs[n]]=cv.toDataURL('image/png').split(',')[1];
    }return out;
  },{flash,motifs});
  for(const [name,data]of Object.entries(decals))fs.writeFileSync(path.join(root,'assets/tattoos',name+'.png'),Buffer.from(data,'base64'));
  await browser.close();console.log(`Generated ${count} equipment PNGs and ${motifs.length} tattoo decals.`);
})().catch(e=>{console.error(e);process.exitCode=1});
