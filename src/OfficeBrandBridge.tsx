import { useEffect } from 'react';
import { supabase } from './lib/supabase';

export default function OfficeBrandBridge({children}:{children:React.ReactNode}){
  useEffect(()=>{
    let alive=true;
    const apply=async()=>{
      if(!supabase)return;
      const {data:{user}}=await supabase.auth.getUser();
      if(!user||!alive)return;
      const {data:profile}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
      if(!profile?.org_id||!alive)return;
      const {data:s}=await supabase.from('organization_settings').select('logo_storage_path,primary_color,secondary_color').eq('org_id',profile.org_id).maybeSingle();
      if(!s||!alive)return;
      if(s.primary_color)document.documentElement.style.setProperty('--office-primary',s.primary_color);
      if(s.secondary_color)document.documentElement.style.setProperty('--office-secondary',s.secondary_color);
      if(s.logo_storage_path){
        const {data:url}=await supabase.storage.from('lexoffice-documents').createSignedUrl(s.logo_storage_path,3600);
        if(url?.signedUrl&&alive){document.documentElement.style.setProperty('--office-logo',`url("${url.signedUrl}")`);document.documentElement.classList.add('has-office-logo')}
      }
    };
    apply();
    const {data:{subscription}}=supabase?.auth.onAuthStateChange(()=>setTimeout(apply,0))||{data:{subscription:null as any}};
    return()=>{alive=false;subscription?.unsubscribe()};
  },[]);
  return children;
}
