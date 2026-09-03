import { AlertCircle,CheckCircle2,Info,Loader2,TriangleAlert } from 'lucide-react';

type Tone='success'|'error'|'warning'|'info'|'loading';
const icons={success:CheckCircle2,error:AlertCircle,warning:TriangleAlert,info:Info,loading:Loader2};
export default function SystemFeedback({tone='info',children,live=true}:{tone?:Tone;children:any;live?:boolean}){
 const Icon=icons[tone];
 return <div className={`system-feedback ${tone}`} role={tone==='error'?'alert':'status'} aria-live={live?'polite':undefined}><Icon size={17} className={tone==='loading'?'spin':''}/><div>{children}</div></div>
}
