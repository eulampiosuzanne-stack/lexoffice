import {HUB_ORIGIN,connectionPath,hubToken,safeQr,type Identity} from './hub-client.ts';
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
type Action='hub_status'|'hub_connect'|'hub_create';
const provider='univitta_hub';
const validId=(id:string)=>/^svc_[A-Za-z0-9_-]{1,120}$/.test(id);
export async function handleUnivittaHub(db:any,orgId:string,requestedAction:Action) {
 const {data:stored,error:configError}=await db.from('system_runtime_secrets').select('secret').eq('key','univitta_hub_lexoffice_identity').maybeSingle();
 if(configError||!stored?.secret)return json({ok:false,error:'hub_not_configured'},503);
 let identity:Identity;try{identity=JSON.parse(stored.secret)}catch{return json({ok:false,error:'hub_not_configured'},503)}
 // The application is approved once. Its identity is not tied to a tenant.
 if(!identity.request_id||!identity.private_key||!identity.application_code||!['sandbox','production'].includes(identity.environment))return json({ok:false,error:'hub_not_configured'},503);
 const {data:existing,error:lookupError}=await db.from('whatsapp_connections').select('id,external_instance_id,status').eq('org_id',orgId).eq('provider_type',provider).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(lookupError)return json({ok:false,error:'connection_lookup_failed'},500);
 if(requestedAction==='hub_create'&&existing)return json({ok:false,error:'connection_already_exists'},409);
 if(requestedAction!=='hub_create'&&!existing)return json({ok:false,error:'connection_not_created'},404);
 try{
   const token=await hubToken(identity);
   const action=requestedAction==='hub_create'?'create':requestedAction==='hub_connect'?'connect':'status';
   const path=action==='create'?'/api/public/v1/services/evolution/connections':connectionPath(String(existing?.external_instance_id||''),action);
   // Stable tenant-scoped reference, not a phone number or a user-supplied value.
   const body=action==='create'?JSON.stringify({label:'LexOffice WhatsApp',owner_ref:'lexoffice:'+orgId}):action==='connect'?'{}':undefined;
   const response=await fetch(HUB_ORIGIN+path,{method:action==='status'?'GET':'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body,signal:AbortSignal.timeout(15000)});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)return json({ok:false,error:'hub_connection_failed',http_status:response.status},502);
   const result=payload.data||payload;
   const connectionId=String(result?.connection_id||result?.id||'');
   if(payload.environment&&payload.environment!==identity.environment||result.environment&&result.environment!==identity.environment)return json({ok:false,error:'hub_environment_mismatch'},502);
   if(action==='create'){
     if(!validId(connectionId))return json({ok:false,error:'hub_invalid_connection_id'},502);
     const {error:saveError}=await db.from('whatsapp_connections').insert({org_id:orgId,provider_type:provider,provider_name:'Univitta Evolution GO',display_name:'WhatsApp pelo Univitta Hub',external_instance_id:connectionId,status:String(result.status||'pending'),is_active:false,settings:{environment:identity.environment}});
     if(saveError)return json({ok:false,error:'connection_persistence_failed'},500);
   }else if(connectionId!==String(existing.external_instance_id))return json({ok:false,error:'hub_response_mismatch'},502);
   const status=String(result.status||'pending');
   if(action!=='create')await db.from('whatsapp_connections').update({status,updated_at:new Date().toISOString()}).eq('id',existing.id).eq('org_id',orgId);
   return json({ok:true,connection_id:action==='create'?connectionId:existing.external_instance_id,status,environment:identity.environment,qr:safeQr(result.qr),delivery_enabled:false});
 }catch{return json({ok:false,error:'hub_request_failed'},502)}
}
