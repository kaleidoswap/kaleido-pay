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
 result.append(el('h2','Decoded fields'));
 for(const f of report.fields){const d=el('details','');d.append(el('summary',`${f.type} · ${f.name} · ${f.bytes} byte`));if(f.decoded!==null)d.append(el('pre',f.decoded));d.append(el('div',f.optional?'Odd TLV · optional':'Even TLV · mandatory to understand','muted'),el('pre',f.hex||'(empty)'));result.append(d)}
 const raw=el('details','');raw.append(el('summary','Full JSON'),el('pre',JSON.stringify(report,null,2)));result.append(raw);
}catch(e){error.textContent=e instanceof Error?e.message:'Decoding failed';result.append(el('div','No result. Check the code you entered.','empty'))}}
document.querySelector('#decode')!.addEventListener('click',decode);
document.querySelector('#example')!.addEventListener('click',()=>{input.value=sample;decode()});
