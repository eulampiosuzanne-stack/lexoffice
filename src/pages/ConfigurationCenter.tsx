import {Link} from 'react-router-dom';
import {configurationDomains} from '../navigation/configuration';
export default function ConfigurationCenter(){return <div className="workspace-page"><div><h1>Central de configurações</h1><p>Cada configuração possui um destino principal. Escolha o que deseja ajustar.</p></div><div className="workspace-hub">{configurationDomains.map(item=><Link key={item.key} className="workspace-hub-card" to={item.path}><h2>{item.title}</h2><p>{item.scope}</p><span>Abrir configuração →</span></Link>)}</div></div>}
