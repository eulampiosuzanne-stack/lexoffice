export type ImportType='clients'|'processes'|'financial';
export type CsvData={headers:string[];rows:string[][];lines:number[]};
export type CatalogRow=Record<string,any>;
export type ImportCatalog={clients:CatalogRow[];processes:CatalogRow[];financial:CatalogRow[]};
export type ImportReview={line:number;raw:Record<string,string>;normalized:CatalogRow;status:'ready'|'duplicate'|'error';notes:string[];recordId?:string;clientName?:string;processName?:string};
export type ImportField={key:string;label:string;aliases:string[];required?:boolean};
const field=(key:string,label:string,aliases:string[],required=false):ImportField=>({key,label,aliases:[key,...aliases],required});
const identity=[field('cpf_cnpj','CPF/CNPJ',['cpf','cnpj','cliente_cpf','cpf_cliente']),field('email','E-mail',['e_mail','cliente_email'])];
const contact=[field('phone','Telefone',['telefone','celular']),field('whatsapp','WhatsApp',['telefone_whatsapp']),field('profession','Profissão',['profissao']),field('notes','Observações',['observacoes'])];
export const importFields:Record<ImportType,ImportField[]>={
 clients:[field('name','Nome do cliente',['nome','cliente','cliente_nome','nome_cliente'],true),...identity,...contact],
 processes:[field('cnj_number','Número do processo',['numero_processo','processo','cnj','processo_numero'],true),field('name','Nome do cliente',['cliente','cliente_nome','nome_cliente','nome']),...identity,field('opposing_party','Parte contrária',['parte_contraria']),field('court','Tribunal',['tribunal']),field('tribunal_name','Nome do tribunal',['tribunal']),field('judicial_system','Sistema judicial',['sistema','sistema_judicial']),field('comarca','Comarca',[]),field('vara','Vara',[]),field('area','Área',[]),field('subject','Assunto',['assunto']),field('class_name','Classe',['classe']),field('notes','Observações',['observacoes'])],
 financial:[field('description','Descrição',['descricao','historico','lancamento']),field('amount','Valor',['valor','valor_total','total'],true),field('name','Nome do cliente',['cliente','cliente_nome','nome_cliente','nome']),...identity,field('cnj_number','Número do processo',['numero_processo','processo','cnj','processo_numero']),field('type','Natureza',['tipo','natureza']),field('category','Categoria',['categoria']),field('due_date','Vencimento',['vencimento','data_vencimento']),field('status','Situação',['situacao']),field('notes','Observações',['observacoes'])]
};
export const importLabels:Record<ImportType,string>={clients:'Clientes',processes:'Processos',financial:'Financeiro'};
export const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
export const normalizedText=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export const headerKey=(value:string)=>normalizedText(value).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
export function parseCsv(input:string):CsvData{
 const text=input.replace(/^\uFEFF/,'');let quoted=false,commas=0,semis=0;
 for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}if(!quoted){if(char==='\n'||char==='\r')break;if(char===',')commas++;if(char===';')semis++;}}
 const delimiter=semis>=commas?';':',';const records:string[][]=[],lines:number[]=[];let row:string[]=[],cell='',inQuotes=false,afterQuote=false,line=1,start=1;
 function pushRow(){row.push(cell.trim());if(row.some(value=>value!=='')){records.push(row);lines.push(start);}row=[];cell='';afterQuote=false;}
 for(let i=0;i<text.length;i++){const char=text[i];if(inQuotes){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{inQuotes=false;afterQuote=true;}}else{cell+=char;if(char==='\n')line++;}continue;}
  if(char==='"'){if(cell.trim()||afterQuote)throw new Error(`Aspas inválidas na linha ${line}.`);cell='';inQuotes=true;}
  else if(char===delimiter){row.push(cell.trim());cell='';afterQuote=false;}
  else if(char==='\r'||char==='\n'){pushRow();if(char==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
  else{if(afterQuote&&char.trim())throw new Error(`Texto após aspas na linha ${line}.`);cell+=char;}
 }
 if(inQuotes)throw new Error('O CSV contém um campo com aspas não fechadas.');if(cell||row.length)pushRow();
 const headers=records.shift()||[];lines.shift();if(!headers.length)throw new Error('O arquivo não contém cabeçalho.');
 const keys=headers.map(headerKey);if(keys.some(key=>!key)||new Set(keys).size!==keys.length)throw new Error('Use nomes de colunas preenchidos e únicos.');
 records.forEach((values,index)=>{if(values.length!==headers.length)throw new Error(`Linha ${lines[index]}: ${values.length} campos; eram esperados ${headers.length}. Confira o separador e as aspas.`);});
 if(!records.length)throw new Error('O arquivo contém apenas o cabeçalho.');return{headers,rows:records,lines};
}
export function autoMapping(type:ImportType,headers:string[]){return Object.fromEntries(importFields[type].map(field=>[field.key,headers.findIndex(header=>[...field.aliases,headerKey(field.label)].includes(headerKey(header)))]));}
export function money(value:string):number|null{const v=value.replace(/R\$/gi,'').replace(/\s/g,'');if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(v)&&!/^\d+(?:\.\d{1,2})?$/.test(v))return null;const number=Number(v.includes(',')?v.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(v)?v.replace(/\./g,''):v);return Number.isFinite(number)&&number>0?number:null;}
export function dateValue(value:string):string|null{if(!value)return null;const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);const iso=br?`${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`:value;if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;const d=new Date(iso+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;}
function matchClient(raw:CatalogRow,clients:CatalogRow[],byName:boolean){const cpf=digits(raw.cpf_cnpj),email=normalizedText(raw.email),name=normalizedText(raw.name);const strong=clients.filter(c=>(cpf&&digits(c.cpf_cnpj)===cpf)||(email&&normalizedText(c.email)===email));if(strong.length>1)throw new Error('CPF/CNPJ ou e-mail apontam para cadastros diferentes. Revise antes de importar.');if(strong.length){const found=strong[0];if(cpf&&digits(found.cpf_cnpj)&&cpf!==digits(found.cpf_cnpj))throw new Error('E-mail existente com CPF/CNPJ diferente. Revise a identificação.');return found;}if(byName&&name){const found=clients.filter(c=>normalizedText(c.name)===name);if(found.length>1)throw new Error('Nome corresponde a mais de um cliente. Informe CPF/CNPJ ou e-mail.');return found[0];}return undefined;}
export function reviewImport(type:ImportType,csv:CsvData,mapping:Record<string,number>,catalog:ImportCatalog):ImportReview[]{
 const clients=[...catalog.clients],processes=[...catalog.processes],financial=[...catalog.financial];
 return csv.rows.map((cells,index)=>{const raw=Object.fromEntries(csv.headers.map((name,i)=>[name,cells[i]||'']));const values=Object.fromEntries(importFields[type].map(field=>[field.key,cells[mapping[field.key]]?.trim()||'']));const result:ImportReview={line:csv.lines[index],raw,normalized:{},status:'ready',notes:[]};
 try{
  for(const field of importFields[type])if(field.required&&!values[field.key])throw new Error(`${field.label} não informado.`);
  if(values.cpf_cnpj&&![11,14].includes(digits(values.cpf_cnpj).length))throw new Error('CPF/CNPJ precisa ter 11 ou 14 dígitos.');
  if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw new Error('E-mail inválido.');
  const client=matchClient(values,clients,type!=='clients');
  if(type==='clients'){
   result.normalized=Object.fromEntries(importFields.clients.map(field=>[field.key,values[field.key]||null]));result.normalized.cpf_cnpj=digits(values.cpf_cnpj)||null;result.normalized.email=normalizedText(values.email)||null;
   if(client){result.status='duplicate';result.recordId=String(client.id);result.notes.push('Cadastro existente ou repetido no arquivo; será ignorado sem alterar seus dados.');}
   else {clients.push({...result.normalized,id:`file:${index}`});result.notes.push('Novo cadastro.');}
  }else{
   result.clientName=client?.name;if(values.name||values.cpf_cnpj||values.email){if(!client)throw new Error('Cliente não encontrado. Importe o cadastro antes ou corrija a identificação.');}
   else result.notes.push('Sem cliente vinculado.');
   if(type==='processes'){
    const cnj=digits(values.cnj_number);if(cnj.length!==20)throw new Error('Número CNJ precisa ter 20 dígitos.');
    const existing=processes.find(p=>digits(p.cnj_number)===cnj);
    result.normalized=Object.fromEntries(importFields.processes.filter(field=>!['name','cpf_cnpj','email'].includes(field.key)).map(field=>[field.key,values[field.key]||null]));result.normalized.client_id=client?.id||null;
    if(existing){result.status='duplicate';result.recordId=String(existing.id);if(client&&existing.client_id&&existing.client_id!==client.id)throw new Error('O processo já está vinculado a outro cliente.');if(client&&!existing.client_id){result.normalized.link_existing=true;result.notes.push('Processo existente: somente o vínculo com o cliente será preenchido.');}else result.notes.push('Processo existente; não será criado novamente.');}
    else {processes.push({...result.normalized,id:`file:${index}`});result.notes.push('Novo processo.');}
   }else{
    const amount=money(values.amount);if(amount===null)throw new Error('Valor inválido. Use, por exemplo, 1.250,00.');const due=dateValue(values.due_date);if(values.due_date&&!due)throw new Error('Vencimento inválido. Use DD/MM/AAAA ou AAAA-MM-DD.');
    const nature=normalizedText(values.type),state=normalizedText(values.status);if(nature&&!['expense','income','despesa','receita','entrada','saida'].includes(nature))throw new Error('Natureza não reconhecida. Use receita ou despesa.');if(state&&!['paid','pending','pago','quitado','pendente','aberto'].includes(state))throw new Error('Situação não reconhecida. Use pago ou pendente.');
    let process:CatalogRow|undefined;if(values.cnj_number){process=processes.find(p=>digits(p.cnj_number)===digits(values.cnj_number));if(!process)throw new Error('Processo não encontrado. Importe o processo antes.');if(client&&process.client_id&&process.client_id!==client.id)throw new Error('O processo pertence a outro cliente.');}else if(client){const matches=processes.filter(p=>p.client_id===client.id);if(matches.length===1){process=matches[0];result.notes.push('Vínculo com o único processo do cliente.');}else if(matches.length>1)result.notes.push('Mais de um processo: lançamento ficará somente no cliente.');}
    result.processName=process?.cnj_number;
    result.normalized={description:values.description||'Lançamento importado',amount,due_date:due,client_id:client?.id||process?.client_id||null,process_id:process?.id||null,type:['expense','despesa','saida'].includes(nature)?'expense':'income',status:['paid','pago','quitado'].includes(state)?'paid':'pending',category:values.category||null,notes:values.notes||null};
    const duplicate=financial.find(f=>['description','amount','due_date','client_id','process_id','type'].every(key=>String(f[key]??'').trim()===String(result.normalized[key]??'').trim()));
    if(duplicate){result.status='duplicate';result.recordId=duplicate.id;result.notes.push('Possível repetição de lançamento com mesmos dados; será ignorada.');}else{financial.push({...result.normalized,id:`file:${index}`});result.notes.push('Novo lançamento.');}
   }
  }
 }catch(error){result.status='error';result.notes=[error instanceof Error?error.message:'Registro inválido.'];}
 return result;});
}
export function csvExport(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"').join(';')).join('\r\n');}
