export type AppInboxItem={id:string;client_id:string;kind?:string|null;subject?:string|null;body?:string|null;created_at:string;read_at?:string|null;document_id?:string|null;clients?:{name?:string|null}|null};
export type AppInboxFilter='all'|'unread'|'document'|'payment_receipt';
export const inboxText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function inboxMatches(item:AppInboxItem,filter:AppInboxFilter,query:string){
 if(filter==='unread'&&item.read_at)return false;
 if((filter==='document'||filter==='payment_receipt')&&item.kind!==filter)return false;
 const term=inboxText(query);return !term||inboxText([item.clients?.name,item.subject,item.body].filter(Boolean).join(' ')).includes(term);
}
export function inboxSubject(item:AppInboxItem){return item.subject||(item.kind==='payment_receipt'?'Comprovante enviado':item.kind==='document'?'Documento enviado':'Nova mensagem');}
export function inboxKind(item:AppInboxItem){return item.kind==='payment_receipt'?'Comprovante':item.kind==='document'?'Documento':'Mensagem';}
