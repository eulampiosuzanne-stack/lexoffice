export const HUB_ORIGIN = 'https://hub.univittagroup.com.br';
export type Identity = {application_code:string;private_key:string;request_id:string;connection_id:string;org_id:string;environment:string};
export function canonical(method:string,path:string,timestamp:string,nonce:string,body:string) {
  if (!path.startsWith('/api/public/') || path.includes('?') || path.includes('#')) throw new Error('Invalid Hub path');
  return [method,path,timestamp,nonce,body].join('\n');
}
export function connectionPath(id:string,action:'status'|'connect') {
  if (!/^svc_[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid connection');
  return `/api/public/v1/services/evolution/connections/${id}/${action}`;
}
export function safeQr(value:unknown):string|null {
  return typeof value==='string' && value.length<=1500000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) ? value : null;
}
export async function signature(identity:Identity,method:string,path:string,body:string,timestamp:string,nonce:string) {
  const base64=identity.private_key.replace(/-----[\w ]+-----/g,'').replace(/\s/g,'');
  const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'Ed25519'},false,['sign']);
  const signed=new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(canonical(method,path,timestamp,nonce,body))));
  return btoa(String.fromCharCode(...signed)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function hubToken(identity:Identity) {
  const path='/api/public/v2/auth/token',body=JSON.stringify({request_id:identity.request_id});
  const timestamp=String(Date.now()),nonce=crypto.randomUUID();
  const response=await fetch(HUB_ORIGIN+path,{method:'POST',headers:{'content-type':'application/json','x-hub-app':identity.application_code,'x-hub-key-alg':'Ed25519','x-hub-timestamp':timestamp,'x-hub-nonce':nonce,'x-hub-signature':await signature(identity,'POST',path,body,timestamp,nonce)},body,signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  const token=data.access_token||data.data?.access_token;
  if(!response.ok||typeof token!=='string'||!token)throw new Error('Hub authorization unavailable');
  // A sandbox approval is never promoted implicitly by the consuming application.
  const environment=data.environment||data.data?.environment;
  if(environment!==identity.environment)throw new Error('Hub environment mismatch');
  return token;
}

