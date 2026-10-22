import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import PlatformProcessProviders from './PlatformProcessProviders';
export default function ProcessProviderSettings(){const[allowed,setAllowed]=useState<boolean|null>(null);useEffect(()=>{let alive=true;(async()=>{const{data:{user}}=await supabase.auth.getUser();const{data}=user?await supabase.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle():{data:null};if(alive)setAllowed(!!data)})();return()=>{alive=false}},[]);return <div className="workspace-page"><h1>Provedores processuais da plataforma</h1>{allowed===null?<p role="status">Verificando permissão…</p>:allowed?<PlatformProcessProviders/>:<p>Esta configuração é exclusiva da administração da plataforma.</p>}</div>}
