import {inspect,sample} from './model';
const input=document.querySelector<HTMLTextAreaElement>('#offer')!;
const result=document.querySelector('#result')!,error=document.querySelector('#error')!;
function el(tag:string,text:string,className?:string){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n}
function decode(){result.replaceChildren();error.textContent='';try{
 const report=inspect(input.value);result.append(el('h2',report.description??'Offer without description'));
 const grid=el('div','','summary');
 for(const [label,value] of [['Amount',report.amount??'Not specified'],['Issuer metadata',report.metadataPresent?'Present':'Absent'],['SSPS rails',report.rails?report.rails.join(' · '):'Not declared'],['TLV fields',String(report.fields.length)]]){
  const metric=el('div','','metric');metric.append(el('span',label,'muted'),el('strong',value));grid.append(metric);
 }result.append(grid);
 if(report.issuer)result.append(el('p',`Issuer: ${report.issuer}`));
 for(const warning of report.warnings)result.append(el('div',warning,'warn'));
 if(report.destinations){
  result.append(el('h2',`Recipient preference · ${report.destinations.network}`));
  const list=el('ol','');
  for(const destination of report.orderedDestinations){
   const item=el('li','');item.append(el('strong',destination.type));
   if(destination.type==='lightning')item.append(el('p','Use this BOLT12 offer (fallback unless explicitly ordered).'));
   else item.append(el('pre',destination.address),el('p',`Server: ${destination.server}`));
   list.append(item);
  }result.append(list);
 }
 result.append(el('h2','Decoded fields'));
 for(const f of report.fields){const d=el('details','');d.append(el('summary',`${f.type} · ${f.name} · ${f.bytes} byte`));if(f.decoded!==null)d.append(el('pre',f.decoded));d.append(el('div',f.optional?'Odd TLV · optional':'Even TLV · mandatory to understand','muted'),el('pre',f.hex||'(empty)'));result.append(d)}
 const raw=el('details','');raw.append(el('summary','Full JSON'),el('pre',JSON.stringify(report,null,2)));result.append(raw);
}catch(e){error.textContent=e instanceof Error?e.message:'Decoding failed';result.append(el('div','No result. Check the code you entered.','empty'))}}
document.querySelector('#decode')!.addEventListener('click',decode);
document.querySelector('#example')!.addEventListener('click',()=>{input.value=sample;decode()});

const scenario=document.querySelector<HTMLSelectElement>('#scenario')!;
const availability=document.querySelector<HTMLSelectElement>('#availability')!;
const scenarioResult=document.querySelector('#scenario-result')!;
function explainRoute(){
 const ordered=scenario.value==='preferences';availability.disabled=!ordered;
 let title:string,description:string,steps:string[],status:string;
 if(ordered){
  const chosen=availability.value==='first'?'Arkade':availability.value==='second'?'Bark':'Lightning';
  title=`${chosen} is the illustrative match`;
  description=chosen==='Arkade'?'The first preference wins when a verified route supports that exact destination.':chosen==='Bark'?'The first destination is unavailable in this scenario, so the wallet considers the next supported destination.':'When neither Ark endpoint is usable, the wallet can request an invoice using the BOLT12 offer, if it supports that flow.';
  steps=['Payer wallet','Check preference order',chosen];status='Concept · Endpoint execution is not wired here';
 }else if(scenario.value==='lightning'){
  title='A fresh invoice from one reusable offer';description='Bark can pay a BOLT12 offer. The payer requests an invoice and pays over Lightning. The receiver can share the same offer again for another payment.';steps=['Bark','BOLT12 → Lightning','Receiver'];status='Existing payment flow · Not executed by this page';
 }else{
  title='Spend through Lightning. Receive on-chain.';description='An Electrum provider discovered over Nostr can bridge a Lightning payment to an on-chain claim. The wallet needs a verified swap, a fee quote and recovery handling. This is separate from SSPS lock negotiation.';steps=['Lightning payer','Electrum swap','Bitcoin address'];status='Swap flow · Requires a live provider and verified quote';
 }
 scenarioResult.replaceChildren(el('div','Illustrative route','eyebrow'),el('h3',title));
 const path=el('div','','path');steps.forEach((step,i)=>{if(i)path.append(el('i','→'));path.append(el('span',step))});
 scenarioResult.append(path,el('p',description),el('p',status,'fine'));
}
scenario.addEventListener('change',explainRoute);availability.addEventListener('change',explainRoute);explainRoute();
