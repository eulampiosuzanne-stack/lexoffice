import {HUB_ORIGIN,connectionPath,hubToken,safeQr,type Identity} from './hub-client.ts';
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
export async function handleUnivittaHub(db:any,orgId:string,requestedAction:'hub_status'|'hub_connect') {
 const {data:stored,error:configError}=await db.from('system_runtime_secrets').select('secret').eq('key','univitta_hub_lexoffice_identity').maybeSingle();
 if(configError||!stored?.secret)return json({ok:false,error:'hub_not_configured'},503);
 let identity:Identity;try{identity=JSON.parse(stored.secret)}catch{return json({ok:false,error:'hub_not_configured'},503)}
 if(identity.org_id!==orgId)return json({ok:false,error:'office_not_authorized'},403);
 if(!identity.request_id||!identity.connection_id||!identity.private_key||!['sandbox','production'].includes(identity.environment))return json({ok:false,error:'hub_not_configured'},503);
 try{
   const token=await hubToken(identity);
   const action=requestedAction==='hub_connect'?'connect':'status';
   const response=await fetch(HUB_ORIGIN+connectionPath(identity.connection_id,action),{method:action==='connect'?'POST':'GET',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:action==='connect'?'{}':undefined,signal:AbortSignal.timeout(15000)});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)return json({ok:false,error:'hub_connection_failed',http_status:response.status},502);
   const result=payload.data;
   if(!result||result.connection_id!==identity.connection_id||payload.environment&&payload.environment!==identity.environment||result.environment&&result.environment!==identity.environment)return json({ok:false,error:'hub_response_mismatch'},502);
   return json({ok:true,connection_id:identity.connection_id,status:String(result.status||'pending'),environment:identity.environment,qr:safeQr(result.qr),delivery_enabled:false});
 }catch{return json({ok:false,error:'hub_request_failed'},502)}
}

