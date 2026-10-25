import mammoth from 'mammoth';
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

export type VisualBlock = 'heading'|'timeline'|'table'|'highlight'|'paragraph';
export type VisualProfile = {name:string;blocks:VisualBlock[];headings:string[];warnings:string[];style:'classico'|'moderno'};
const isHeading=(s:string)=>/^(?:[IVXLCDM]+[.\-–)]|\d+(?:\.\d+)*[.\-–)]|DOS? |DAS? |DA |DE |DO |PRELIMINAR|CONCLUSÃO|PEDIDOS|FATOS|DIREITO)/i.test(s)&&s.length<140;
export async function inspectTemplate(file:File):Promise<VisualProfile>{
 if(!/\.docx$/i.test(file.name))throw new Error('O motor aceita modelos DOCX.');
 const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
 const html=result.value;const parsed=new DOMParser().parseFromString(html,'text/html');
 const headings=Array.from(parsed.querySelectorAll('h1,h2,h3,p')).map(n=>n.textContent?.trim()||'').filter(isHeading).slice(0,35);
 const text=parsed.body.textContent||'';
 const blocks:VisualBlock[]=['heading','paragraph'];
 if(parsed.querySelector('table'))blocks.push('table');
 if(/cronologia|linha do tempo|\b20\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/i.test(text))blocks.push('timeline');
 if(parsed.querySelector('strong,b')||/atenção|importante|síntese/i.test(text))blocks.push('highlight');
 return {name:file.name,blocks,headings,warnings:result.messages.map(m=>m.message).slice(0,6),style:/times new roman|garamond|serif/i.test(html)?'classico':'moderno'};
}
const paragraph=(text:string,bold=false)=>new Paragraph({spacing:{after:150,line:340},children:[new TextRun({text,bold,size:24,font:'Aptos'})]});
const heading=(text:string)=>new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{before:240,after:150},children:[new TextRun({text,bold:true,color:'17365D',size:28,font:'Aptos Display'})]});
const cell=(value:string)=>new TableCell({shading:{type:ShadingType.CLEAR,fill:'F3F6FA'},margins:{top:120,bottom:120,left:150,right:150},children:[paragraph(value)]});
export async function createVisualPetition(input:{title:string;facts:string;law:string;requests:string;timeline?:string;profile?:VisualProfile}):Promise<Blob>{
 const sections:[string,string][]=[['DOS FATOS',input.facts],['DO DIREITO',input.law],['DOS PEDIDOS',input.requests]];
 const children:(Paragraph|Table)[]=[new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:360},children:[new TextRun({text:input.title.toUpperCase(),bold:true,size:32,color:'17365D'})]})];
 for(const [label,value] of sections){children.push(heading(label));for(const line of value.split(/\n+/).map(s=>s.trim()).filter(Boolean))children.push(paragraph(line));}
 if(input.timeline?.trim()){children.push(heading('CRONOLOGIA DOS FATOS'));const lines=input.timeline.split('\n').map(s=>s.trim()).filter(Boolean);children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:lines.map(line=>new TableRow({children:[cell(line)]})),borders:{bottom:{style:BorderStyle.SINGLE,size:4,color:'CBD5E1'}}}));}
 children.push(paragraph('Documento gerado para revisão jurídica. Conferir fatos, fundamentos, pedidos e dados processuais antes do protocolo.'));
 const doc=new Document({sections:[{properties:{page:{margin:{top:1440,bottom:1440,left:1440,right:1440}}},children}]});
 return await Packer.toBlob(doc);
}
