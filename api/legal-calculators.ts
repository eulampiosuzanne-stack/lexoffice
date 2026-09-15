const SUPABASE_FUNCTION_URL='https://dcpwcuototomxoiszukt.supabase.co/functions/v1/legal-calculators';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_h1gal1BQha__PKo2_wxY_Q_wZfAqoEm';

export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
 const authorization=String(req.headers.authorization||'');
 if(!authorization.startsWith('Bearer '))return res.status(401).json({ok:false,error:'Sessão expirada. Entre novamente na LexOffice.'});
 try{
  const upstream=await fetch(SUPABASE_FUNCTION_URL,{method:'POST',headers:{'content-type':'application/json','authorization':authorization,'apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(req.body||{})});
  const text=await upstream.text();
  res.status(upstream.status).setHeader('content-type',upstream.headers.get('content-type')||'application/json');
  return res.send(text);
 }catch(error){
  console.error('legal-calculators proxy error',error);
  return res.status(502).json({ok:false,error:'Não foi possível comunicar com o serviço de cálculos.'});
 }
}
