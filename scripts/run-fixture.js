#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const YAML=require('yaml');
(async()=>{
  const cfg=YAML.parse(fs.readFileSync(path.join(__dirname,'..','config','fixtures.yaml'),'utf8'))||{};
  const list=cfg.fixtures||[]; if(list.length!==1){console.error('Expected one fixture');process.exit(1);} 
  const target=list[0];
  const base='http://localhost:3000';
  const day=new Date().toISOString().slice(0,10);
  const dir=path.join(__dirname,'..','runs',day); fs.mkdirSync(dir,{recursive:true});
  const enc=encodeURIComponent(target);
  const r0=await fetch(`${base}/api/build?url=${enc}&push=0&debug=1`);
  const j0=await r0.json();
  fs.writeFileSync(path.join(dir,'poolboys.resolve.json'),JSON.stringify(j0,null,2));
  const cov=(j0.debug?.trace||[]).find(t=>t.stage==='gate'&&t.type==='resolve')?.coverage||0;
  const r1=await fetch(`${base}/api/build?url=${enc}&push=1&debug=1`);
  const j1=await r1.json();
  fs.writeFileSync(path.join(dir,'poolboys.push.json'),JSON.stringify(j1,null,2));
  const miss=j1.missingRequired?j1.missingRequired.length:(j1.debug?.trace||[]).find(t=>t.stage==='gate'&&t.type==='publish')?.missing?.length||0;
  const sent=(j1.debug?.trace||[]).find(t=>t.step==='acf_sync')?.sent_keys?.length||0;
  console.log(`${Math.round(cov*100)}% ${miss} ${r1.status} ${sent}`);
})();
