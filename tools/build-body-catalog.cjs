const fs=require('node:fs'),path=require('node:path');
const profiles=require('./body-types.json'),rigs=require('./body-rig.json');
const catalog=Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,{
 label:p.label,
 front:{src:`assets/bodies/${id}-front-v8.png`,anchors:rigs[id].front.anchors,tattoos:rigs[id].front.tattoos,feetCut:rigs[id].front.feetCut},
 back:{src:`assets/bodies/${id}-back-v8.png`,anchors:rigs[id].back.anchors,tattoos:rigs[id].back.tattoos,feetCut:rigs[id].back.feetCut}
}]));
fs.writeFileSync(path.join(__dirname,'../assets/body-catalog.js'),'// Approved body artwork and independent front/back attachment points.\nwindow.FIGHT_CLUB_BODY_CATALOG='+JSON.stringify(catalog)+';\n');
console.log('Generated catalog for 10 new body types.');
