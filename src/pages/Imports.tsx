import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { FileUp, RefreshCw, UploadCloud, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Download, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useConfirmNavigation } from '../lib/useConfirmNavigation';
import { parseCsv, autoMapping, reviewImport, importFields, importLabels, csvExport, type CsvData, type ImportType, type ImportCatalog, type ImportReview, type CatalogRow } from '../lib/importWorkspace';
import { executeImportRows, type ImportOutcome } from '../lib/executeImport';
import './imports-workspace.css';
type Job = {
    id: string;
    import_type: ImportType;
    file_name: string;
    status: string;
    total_rows: number;
    imported_rows: number;
    error_rows: number;
    duplicate_rows: number;
    created_at: string;
};
type Outcome = ImportOutcome;
const blankCatalog = (): ImportCatalog => ({ clients: [], processes: [], financial: [] });
const statusLabel = (value: string) => ({ processing: 'Em andamento', completed: 'Concluída', completed_with_errors: 'Concluída com erros', failed: 'Interrompida', ready: 'Pronto', duplicate: 'Ignorado', error: 'Erro', imported: 'Importado', linked: 'Vínculo preenchido' } as Record<string, string>)[value] || value;
function download(name: string, rows: unknown[][]) { const url = URL.createObjectURL(new Blob([csvExport(rows)], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default function Imports({ allowFinancial = true }: {
    allowFinancial?: boolean;
}) {
    const [params] = useSearchParams();
    const location = useLocation(), navigate = useNavigate();
    const requested = params.get('tipo');
    const type: ImportType = requested === 'processes' || requested === 'financial' ? requested : location.pathname === '/processos/importar' ? 'processes' : location.pathname === '/financeiro/importar' ? 'financial' : 'clients';
    const [step, setStep] = useState(0), [file, setFile] = useState<File | null>(null), [csv, setCsv] = useState<CsvData | null>(null), [mapping, setMapping] = useState<Record<string, number>>({}), [review, setReview] = useState<ImportReview[]>([]), [results, setResults] = useState<Outcome[]>([]), [jobs, setJobs] = useState<Job[]>([]);
    const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [historyBusy, setHistoryBusy] = useState(false), [historyError, setHistoryError] = useState(''), [notice, setNotice] = useState(''), [progress, setProgress] = useState(0), [reviewFilter, setReviewFilter] = useState('all'), [historyRows, setHistoryRows] = useState<Outcome[]>([]), [historyJob, setHistoryJob] = useState<Job | null>(null);
    const mutation = useRef(false), fileRead = useRef(0), mounted = useRef(true);
    const locked = busy || checking;
    useEffect(() => () => { mounted.current = false; fileRead.current++; }, []);
    useConfirmNavigation(busy || Boolean(file && step < 3));
    async function identity() { const { data, error } = await supabase.auth.getUser(); if (error || !data.user)
        throw new Error('Sessão expirada. Entre novamente.'); const profile = await supabase.from('profiles').select('org_id').eq('id', data.user.id).single(); if (profile.error || !profile.data?.org_id)
        throw new Error('Escritório não identificado.'); return { orgId: profile.data.org_id, userId: data.user.id }; }
    async function allRows(table: string, columns: string, orgId: string, jobId?: string) { const out: CatalogRow[] = []; for (let from = 0;; from += 500) {
        let request = supabase.from(table).select(columns).eq('org_id', orgId).order('id').range(from, from + 499);
        if (jobId)
            request = request.eq('import_job_id', jobId);
        const { data, error } = await request;
        if (error)
            throw new Error(`Não foi possível consultar ${{ clients: 'os clientes', processes: 'os processos', financial_entries: 'os lançamentos', import_rows: 'as linhas da importação' }[table] || 'os registros'}: ${error.message}`);
        out.push(...(data || []));
        if ((data || []).length < 500)
            return out;
    } }
    async function catalog(orgId: string) { const data = blankCatalog(); const requests = await Promise.all([allRows('clients', 'id,name,cpf_cnpj,email', orgId), type !== 'clients' ? allRows('processes', 'id,client_id,cnj_number', orgId) : Promise.resolve([]), type === 'financial' ? allRows('financial_entries', 'id,description,amount,due_date,client_id,process_id,type', orgId) : Promise.resolve([])]); [data.clients, data.processes, data.financial] = requests; return data; }
    async function loadHistory() { setHistoryBusy(true); setHistoryError(''); try {
        const { orgId } = await identity();
        const { data, error } = await supabase.from('import_jobs').select('id,import_type,file_name,status,total_rows,imported_rows,error_rows,duplicate_rows,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(30);
        if (error)
            throw error;
        if (mounted.current)
            setJobs((data || []) as Job[]);
    }
    catch (error) {
        if (mounted.current)
            setHistoryError(error instanceof Error ? error.message : 'Não foi possível consultar o histórico.');
    }
    finally {
        if (mounted.current)
            setHistoryBusy(false);
    } }
    useEffect(() => { mounted.current = true; void loadHistory(); }, []);
    function reset() { fileRead.current++; setStep(0); setFile(null); setCsv(null); setMapping({}); setReview([]); setResults([]); setProgress(0); setNotice(''); setReviewFilter('all'); }
    function changeType(value: string) { if (locked)
        return; if (file && !window.confirm('Trocar o tipo e descartar a preparação deste arquivo?'))
        return; reset(); navigate(value === 'clients' ? '/importacoes' : value === 'processes' ? '/processos/importar' : '/financeiro/importar'); }
    async function choose(next: File | null) { if (locked)
        return; const revision = ++fileRead.current; setNotice(''); setCsv(null); setReview([]); setResults([]); setFile(null); if (!next)
        return; if (!next.name.toLowerCase().endsWith('.csv'))
        return setNotice('Escolha um arquivo CSV. Planilhas XLSX precisam ser salvas como CSV.'); if (next.size > 10 * 1024 * 1024)
        return setNotice('O arquivo excede 10 MB. Divida-o em arquivos menores.'); setChecking(true); try {
        const parsed = parseCsv(await next.text());
        if (revision !== fileRead.current || !mounted.current)
            return;
        if (parsed.rows.length > 10000)
            throw new Error('Use até 10.000 registros por arquivo. Divida esta planilha antes de continuar.');
        setFile(next);
        setCsv(parsed);
        setMapping(autoMapping(type, parsed.headers));
    }
    catch (error) {
        if (revision === fileRead.current)
            setNotice(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.');
    }
    finally {
        if (revision === fileRead.current)
            setChecking(false);
    } }
    async function analyze() { if (!csv || locked)
        return; setChecking(true); setNotice(''); try {
        const { orgId } = await identity();
        const data = await catalog(orgId);
        const next = reviewImport(type, csv, mapping, data);
        setReview(next);
        setReviewFilter('all');
        setStep(2);
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Não foi possível conferir os dados. Nenhum registro foi gravado.');
    }
    finally {
        setChecking(false);
    } }
    const signature = (items: ImportReview[]) => JSON.stringify(items.map(item => [item.status, item.recordId, item.normalized, item.clientName, item.processName]));
    async function run() {
        if ((type === 'financial' && !allowFinancial) || mutation.current || locked || !csv || !file || !review.some(row => row.status === 'ready' || row.normalized.link_existing))
            return;
        mutation.current = true;
        setBusy(true);
        setProgress(0);
        setNotice('');
        const outcomes: Outcome[] = [];
        let jobId = '', orgId = '', userId = '';
        let logFailure = false;
        try {
            ({ orgId, userId } = await identity());
            const latest = reviewImport(type, csv, mapping, await catalog(orgId));
            if (signature(latest) !== signature(review)) {
                setReview(latest);
                setNotice('Os cadastros mudaram desde a conferência. Revise a prévia atualizada e confirme novamente.');
                return;
            }
            const job = await supabase.from('import_jobs').insert({ org_id: orgId, created_by: userId, import_type: type, file_name: file.name, status: 'processing', total_rows: review.length, started_at: new Date().toISOString(), column_mapping: { headers: csv.headers, mapping, auto_link: true } }).select('id').single();
            if (job.error || !job.data?.id)
                throw new Error(job.error?.message || 'Não foi possível registrar a importação.');
            jobId = job.data.id;
            const execution = await executeImportRows(supabase, review, { type, orgId, userId, jobId }, rows => { outcomes.splice(0, outcomes.length, ...rows); setResults(rows); setProgress(rows.length); });
            logFailure = execution.logFailure;
            const errors = outcomes.filter(row => row.status === 'error').length, imported = outcomes.filter(row => row.status === 'imported').length, duplicates = outcomes.filter(row => row.status === 'duplicate' || row.status === 'linked').length;
            const finish = await supabase.from('import_jobs').update({ status: errors || logFailure ? 'completed_with_errors' : 'completed', valid_rows: review.filter(row => row.status !== 'error').length, imported_rows: imported, error_rows: errors, duplicate_rows: duplicates, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), column_mapping: { headers: csv.headers, mapping, auto_link: true, links_created: outcomes.filter(row => row.status === 'linked').length } }).eq('id', jobId).eq('org_id', orgId).select('id');
            if (finish.error || !finish.data?.length)
                logFailure = true;
            setStep(3);
            setNotice(logFailure ? 'Os resultados abaixo refletem as gravações confirmadas, mas o histórico não foi salvo integralmente. Baixe o relatório antes de sair.' : 'Importação finalizada. Confira o resultado de cada linha.');
            await loadHistory();
        }
        catch (error) {
            setResults(outcomes);
            if (jobId) {
                await supabase.from('import_jobs').update({ status: 'failed', imported_rows: outcomes.filter(row => row.status === 'imported').length, error_rows: outcomes.filter(row => row.status === 'error').length, finished_at: new Date().toISOString() }).eq('id', jobId).eq('org_id', orgId);
                setStep(3);
            }
            setNotice((error instanceof Error ? error.message : 'Importação interrompida.') + (outcomes.length ? ' Parte do arquivo já foi processada. Confira e baixe o resultado antes de tentar novamente.' : ''));
        }
        finally {
            mutation.current = false;
            setBusy(false);
        }
    }
    async function historyDetail(job: Job) { if (locked)
        return; setHistoryJob(job); setHistoryRows([]); setHistoryBusy(true); setHistoryError(''); try {
        const { orgId } = await identity();
        const data = await allRows('import_rows', 'id,row_number,raw_data,normalized_data,status,validation_errors,imported_record_id', orgId, job.id);
        setHistoryRows(data.sort((a, b) => a.row_number - b.row_number).map(row => ({ line: row.row_number, label: row.normalized_data?.name || row.normalized_data?.cnj_number || row.normalized_data?.description || Object.values(row.raw_data || {})[0] || '', status: row.status, notes: (row.validation_errors || []).join(' ') || (row.status === 'imported' ? 'Registro criado.' : row.status === 'duplicate' ? 'Registro existente ou repetido.' : ''), id: row.imported_record_id })));
    }
    catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'Não foi possível ler as linhas.');
    }
    finally {
        setHistoryBusy(false);
    } }
    function report(items: Outcome[], name = 'resultado-importacao.csv') { download(name, [['Linha', 'Registro', 'Resultado', 'Detalhes', 'ID'], ...items.map(row => [row.line, row.label, statusLabel(row.status), row.notes, row.id || ''])]); }
    function sample() { const fields = importFields[type]; const examples: Record<string, string> = { name: 'Cliente Exemplo', cpf_cnpj: '', email: 'cliente@example.invalid', phone: '', whatsapp: '', profession: '', notes: 'Exemplo: substitua pelos dados reais antes de importar.', cnj_number: '0000000-00.0000.0.00.0000', description: 'Honorários', amount: '1250,00', due_date: '31/12/2026', type: 'receita', status: 'pendente' }; download(`modelo-${type}.csv`, [fields.map(field => field.label), fields.map(field => examples[field.key] || '')]); }
    const ready = review.filter(row => row.status === 'ready').length, duplicates = review.filter(row => row.status === 'duplicate').length, errors = review.filter(row => row.status === 'error').length, links = review.filter(row => row.status === 'duplicate' && row.normalized.link_existing).length;
    const visible = review.filter(row => reviewFilter === 'all' || row.status === reviewFilter);
    const mappingMissing = importFields[type].some(field => field.required && (mapping[field.key] ?? -1) < 0);
    if (type === 'financial' && !allowFinancial)
        return <div className="imports-workspace"><h1>Importação financeira indisponível</h1><p>Este perfil não tem acesso ao módulo financeiro.</p><Link to="/importacoes">Importar clientes</Link></div>;
    return <div className="imports-workspace">
  <header className="imports-heading"><div><span className="imports-eyebrow">ORGANIZAÇÃO DA BASE</span><h1>{type === 'clients' ? 'Importar cadastros' : `Importar ${importLabels[type].toLowerCase()}`}</h1><p>Prepare, confira e importe com clareza sobre cada registro.</p></div><Link className="secondary" to={type === 'clients' ? '/clientes' : type === 'processes' ? '/processos' : '/financeiro/recebimentos'}><ArrowLeft size={16}/>Voltar a {importLabels[type].toLowerCase()}</Link></header>
  <div className="imports-type-bar"><label>O que deseja importar?<select value={type} disabled={locked} onChange={e => changeType(e.target.value)}>{Object.entries(importLabels).filter(([value]) => value !== 'financial' || allowFinancial).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p>Cadastros existentes são preservados. Nenhuma gravação ocorre antes da revisão.</p></div>
  <ol className="imports-steps" aria-label="Etapas da importação">{['Arquivo', 'Colunas', 'Revisão', 'Resultado'].map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <CheckCircle2 size={17}/> : index + 1}</span><strong>{label}</strong></li>)}</ol>
  {notice && <p className="imports-notice" role="status">{notice}</p>}
  {step === 0 && <section className="imports-panel"><div className="imports-section-heading"><div><h2>Selecione sua planilha</h2><p>CSV com cabeçalho, separado por ponto e vírgula ou vírgula.</p></div><button className="secondary" disabled={locked} onClick={sample}><Download size={16}/>Baixar modelo</button></div><div className="imports-upload"><FileSpreadsheet size={38}/><h3>{file?.name || 'Traga os dados para o LexOffice'}</h3><p>Até 10 MB e 10.000 registros por arquivo. Salve planilhas Excel como CSV UTF-8.</p><label className="imports-file-label">{checking ? 'Lendo arquivo…' : file ? 'Trocar arquivo CSV' : 'Selecionar arquivo CSV'}<input key={fileRead.current} type="file" accept=".csv,text/csv" aria-label="Selecionar arquivo CSV" disabled={locked} onChange={e => void choose(e.target.files?.[0] || null)}/></label>{csv && <span className="imports-file-summary"><CheckCircle2 size={16}/>{csv.rows.length} registros · {csv.headers.length} colunas detectadas</span>}</div>{false}<div className="imports-help"><strong>Antes de começar</strong><p>O modelo mostra os campos aceitos. Para {type === 'clients' ? 'clientes, o nome é obrigatório; CPF/CNPJ e e-mail ajudam a identificar duplicados.' : type === 'processes' ? 'processos, informe o CNJ e os identificadores do cliente já cadastrado.' : 'lançamentos, confira valor, vencimento, situação e cliente antes de confirmar.'}</p></div><footer className="imports-footer"><span>Seus dados ainda não foram importados.</span><button className="primary" disabled={!csv || locked} onClick={() => { setNotice(''); setStep(1); }}>Conferir colunas<ArrowRight size={16}/></button></footer></section>}
  {step === 1 && csv && <section className="imports-panel"><div className="imports-section-heading"><div><h2>Confira a correspondência das colunas</h2><p>Escolha qual coluna alimenta cada campo. Campos opcionais podem ser ignorados.</p></div><span>{file?.name}</span></div><div className="imports-table-wrap"><table><thead><tr><th>Campo no LexOffice</th><th>Coluna no arquivo</th><th>Exemplo da primeira linha</th></tr></thead><tbody>{importFields[type].map(field => <tr key={field.key}><td><strong>{field.label}</strong>{field.required && <small>Obrigatório</small>}</td><td><select aria-label={`Coluna para ${field.label}`} value={mapping[field.key] ?? -1} disabled={locked} onChange={e => setMapping(previous => ({ ...previous, [field.key]: Number(e.target.value) }))}><option value={-1}>Não importar este campo</option>{csv.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></td><td>{csv.rows[0]?.[mapping[field.key]] || '—'}</td></tr>)}</tbody></table></div>{mappingMissing && <p className="imports-warning"><AlertTriangle size={16}/>Associe todos os campos obrigatórios para continuar.</p>}<footer className="imports-footer"><button className="secondary" disabled={locked} onClick={() => setStep(0)}><ArrowLeft size={16}/>Voltar</button><button className="primary" disabled={locked || mappingMissing} onClick={() => void analyze()}>{checking ? 'Conferindo cadastros…' : 'Validar e revisar'}<ArrowRight size={16}/></button></footer></section>}
  {step === 2 && <section className="imports-panel"><div className="imports-section-heading"><div><h2>Revise antes de importar</h2><p>{file?.name} · {review.length} registros conferidos. Nenhum cadastro será sobrescrito.</p></div><button className="secondary" disabled={locked} onClick={() => report(review.map(row => ({ line: row.line, label: String(row.normalized.name || row.normalized.cnj_number || row.normalized.description || Object.values(row.raw)[0] || ''), status: row.status, notes: row.notes.join(' ') })), 'conferencia-importacao.csv')}><Download size={16}/>Baixar conferência</button></div><div className="imports-summary"><div><strong>{ready}</strong><span>Novos registros</span></div><div><strong>{duplicates}</strong><span>Existentes / repetidos</span></div><div><strong>{errors}</strong><span>Com erro · não serão importados</span></div>{links > 0 && <div><strong>{links}</strong><span>Vínculos a preencher</span></div>}</div><div className="imports-review-filters" aria-label="Filtrar conferência">{[['all', 'Todos'], ['ready', 'Novos'], ['duplicate', 'Existentes'], ['error', 'Com erro']].map(([value, label]) => <button className={reviewFilter === value ? 'primary' : 'secondary'} key={value} aria-pressed={reviewFilter === value} disabled={locked} onClick={() => setReviewFilter(value)}>{label}</button>)}</div><div className="imports-table-wrap"><table><thead><tr><th>Linha</th><th>Registro</th><th>Vínculo previsto</th><th>Conferência</th><th>Detalhes</th></tr></thead><tbody>{visible.slice(0, 100).map(row => <tr key={row.line}><td>{row.line}</td><td><strong>{String(row.normalized.name || row.normalized.cnj_number || row.normalized.description || Object.values(row.raw)[0] || '—')}</strong>{type === 'clients' && <small>{row.normalized.cpf_cnpj || row.normalized.email || 'Sem identificador de duplicidade'}</small>}</td><td>{row.clientName || '—'}{row.processName && <small>{row.processName}</small>}</td><td><span className={`imports-status ${row.status}`}>{row.status === 'duplicate' && row.normalized.link_existing ? 'Preencher vínculo' : statusLabel(row.status)}</span></td><td>{row.notes.join(' ')}</td></tr>)}</tbody></table>{!visible.length && <p className="imports-empty">Nenhum registro neste filtro.</p>}</div><small>Exibindo até 100 linhas do filtro. O relatório contém a conferência completa.</small><div className="imports-help"><strong>O que acontecerá ao confirmar</strong><p>Somente {ready} novo(s) registro(s){links ? ` e ${links} vínculo(s) previstos` : ''} serão gravados. Duplicados serão ignorados e linhas com erro precisarão de correção. {type !== 'clients' ? 'Confira os vínculos acima; nomes ambíguos impedem a importação da linha.' : 'Registros sem CPF/CNPJ ou e-mail não têm identificação segura de duplicidade; revise-os com atenção.'}</p></div>{busy && <div className="imports-progress" role="status"><label htmlFor="import-progress">Processando {progress} de {review.length}</label><progress id="import-progress" value={progress} max={review.length}/><small>Mantenha esta página aberta até concluir.</small></div>}<footer className="imports-footer"><button className="secondary" disabled={locked} onClick={() => setStep(1)}><ArrowLeft size={16}/>Ajustar colunas</button><button className="primary" disabled={locked || (!ready && !links)} onClick={() => void run()}><UploadCloud size={17}/>{busy ? 'Importando…' : `Confirmar importação de ${ready + links} registro(s)`}</button></footer></section>}
  {step === 3 && <section className="imports-panel"><div className="imports-section-heading"><div><h2>Resultado da importação</h2><p>{results.length} de {csv?.rows.length || 0} linhas processadas.</p></div><button className="secondary" onClick={() => report(results)}><Download size={16}/>Baixar relatório</button></div><div className="imports-summary">{[['imported', 'Importados'], ['duplicate', 'Ignorados'], ['linked', 'Vínculos preenchidos'], ['error', 'Com erro']].map(([value, label]) => <div key={value}><strong>{results.filter(row => row.status === value).length}</strong><span>{label}</span></div>)}</div><ResultTable items={results} type={type}/><footer className="imports-footer"><button className="secondary" onClick={reset}>Nova importação</button><Link className="primary" to={type === 'clients' ? '/clientes' : type === 'processes' ? '/processos' : '/financeiro/recebimentos'}>Ver {importLabels[type].toLowerCase()}<ArrowRight size={16}/></Link></footer></section>}
  <section className="imports-panel imports-history"><div className="imports-section-heading"><div><h2>Histórico recente</h2><p>Últimas 30 importações do escritório, incluindo os outros tipos.</p></div><button className="secondary" disabled={locked || historyBusy} onClick={() => void loadHistory()}><RefreshCw size={16}/>Atualizar</button></div>{historyError && <p role="alert" className="imports-warning">{historyError}</p>}{historyBusy ? <p role="status">Consultando histórico…</p> : !jobs.length && !historyError ? <p className="imports-empty">Nenhuma importação registrada.</p> : <div className="imports-history-list">{jobs.map(job => <button key={job.id} className="imports-history-job" disabled={locked || historyBusy} onClick={() => void historyDetail(job)}><FileUp size={21}/><span><strong>{job.file_name}</strong><small>{importLabels[job.import_type] || job.import_type} · {new Date(job.created_at).toLocaleString('pt-BR')} · {job.total_rows} linhas</small></span><span><strong>{statusLabel(job.status)}</strong><small>{job.imported_rows || 0} importados · {job.error_rows || 0} erros · {job.duplicate_rows || 0} duplicados</small></span><ChevronRight size={17}/></button>)}</div>}{historyJob && !historyBusy && <div className="imports-history-detail"><div className="imports-section-heading"><h3>{historyJob.file_name}</h3><button className="secondary" disabled={!historyRows.length} onClick={() => report(historyRows)}><Download size={15}/>Baixar relatório</button><button className="secondary" onClick={() => setHistoryJob(null)}>Fechar detalhes</button></div><ResultTable items={historyRows} type={historyJob.import_type}/></div>}</section>
 </div>;
}
function ResultTable({ items, type }: {
    items: Outcome[];
    type: ImportType;
}) { return <><div className="imports-table-wrap"><table><thead><tr><th>Linha</th><th>Registro</th><th>Resultado</th><th>Detalhes</th></tr></thead><tbody>{items.slice(0, 100).map(row => <tr key={row.line}><td>{row.line}</td><td>{type === 'clients' && row.id && row.status !== 'error' ? <Link to={`/clientes/${row.id}`}>{row.label}</Link> : row.label}</td><td><span className={`imports-status ${row.status}`}>{statusLabel(row.status)}</span></td><td>{row.notes}</td></tr>)}</tbody></table>{!items.length && <p className="imports-empty">Nenhuma linha disponível neste relatório.</p>}</div>{items.length > 100 && <small>Primeiras 100 linhas. Baixe o relatório para ver todas.</small>}</>; }
