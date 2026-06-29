import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutGrid, Store, Package, Truck, ShoppingBag, FileText,
  Plus, Trash2, Pencil, X, Copy, Check, Download, MapPin, User, Search,
  TrendingUp, AlertTriangle, Boxes, RefreshCw, Wifi, WifiOff, Lock, LogOut, Shield, Eye, EyeOff,
} from "lucide-react";
import { listAll, put, del, probeStorage } from "./storage";

/* ============================================================
   FUNPARTS · CONTROLE DE CONSIGNAÇÃO
   Gestão de quadros em pontos de venda (consignação).
   Storage: Firebase RTDB (produção) | localStorage (fallback)
   ============================================================ */

// ---------- tokens de design ----------
const C = {
  bg:       "#0B0C0E",
  surface:  "#141619",
  surface2: "#1B1E23",
  border:   "#2A2F36",
  text:     "#E8EAED",
  muted:    "#8B929C",
  blue:     "#2BA8D6",
  blueSoft: "#5BC2E7",
  orange:   "#FF6A1A",
  green:    "#3FB97F",
  red:      "#E5544B",
};

// ---------- helpers ----------
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? d.split("-").reverse().join("/") : "");

const maskCPF = (v) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const maskPhone = (v) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");

// ---------- mutações em memória ----------
const upsert = (arr, obj) => {
  const i = arr.findIndex((x) => x.id === obj.id);
  return i >= 0 ? arr.map((x) => (x.id === obj.id ? obj : x)) : [...arr, obj];
};
const byNome = (a) => [...a].sort((x, y) => x.nome.localeCompare(y.nome));
const byData = (a) =>
  [...a].sort((x, y) => (y.data + y.id).localeCompare(x.data + x.id));

// ---------- prefixos de chave ----------
const PFX = { pdv: "fpc:pdv:", prod: "fpc:prod:", mov: "fpc:mov:" };

// ============================================================
//  APP
// ============================================================

// ────────────────────────────────────────────────────────────────────────────────
// AUTH HELPERS
// ────────────────────────────────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

const PERM_LABELS = {
  painel:   'Painel',
  vender:   'Registrar Venda',
  enviar:   'Transferir Estoque',
  pdv:      'Pontos de Venda',
  catalogo: 'Catálogo',
  vendas:   'Vendas / NF',
};
const DEFAULT_PERMS = { painel:true, vender:true, enviar:true, pdv:false, catalogo:true, vendas:true };

// ────────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ────────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [tipo, setTipo] = useState('pdv');
  const [pdvId, setPdvId] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdvList, setPdvList] = useState([]);
  const [firstSetup, setFirstSetup] = useState(false);
  const [senhaConf, setSenhaConf] = useState('');

  useEffect(() => {
    Promise.all([listAll('pdv:'), listAll('auth:master')]).then(([pvs, ms]) => {
      setPdvList(pvs || []);
      if (!ms || ms.length === 0) setFirstSetup(true);
    });
  }, []);

  const doLogin = async () => {
    if (!senha.trim()) { setErro('Digite a senha.'); return; }
    setLoading(true); setErro('');
    try {
      const hash = await sha256(senha);
      if (tipo === 'master') {
        const ms = await listAll('auth:master');
        if (ms?.[0]?.senhaHash === hash) {
          const s = { tipo: 'master' };
          sessionStorage.setItem('fp_auth', JSON.stringify(s));
          onLogin(s);
        } else setErro('Senha incorreta.');
      } else {
        if (!pdvId) { setErro('Selecione o PDV.'); setLoading(false); return; }
        const as2 = await listAll('auth:pdv:');
        const found = (as2 || []).find(a => a.pdvId === pdvId);
        if (!found?.senhaHash) { setErro('Acesso não configurado. Fale com o administrador.'); setLoading(false); return; }
        if (found.senhaHash === hash) {
          const s = { tipo: 'pdv', pdvId, permissoes: found.permissoes || DEFAULT_PERMS };
          sessionStorage.setItem('fp_auth', JSON.stringify(s));
          onLogin(s);
        } else setErro('Senha incorreta.');
      }
    } catch { setErro('Erro de conexão. Tente novamente.'); }
    setLoading(false);
  };

  const doSetup = async () => {
    if (senha.length < 6) { setErro('Mínimo 6 caracteres.'); return; }
    if (senha !== senhaConf) { setErro('As senhas não coincidem.'); return; }
    setLoading(true);
    const hash = await sha256(senha);
    await put('auth:master', { id: 'master', senhaHash: hash });
    setFirstSetup(false); setErro(''); setSenha(''); setSenhaConf('');
    setLoading(false);
  };

  const Sc = {
    screen: { minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '48px 40px', width: 380, maxWidth: '100%' },
    logoRow: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 },
    bar: { width: 4, height: 28, background: C.orange, borderRadius: 3 },
    logoTxt: { fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' },
    sub: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center', marginBottom: 28 },
    lbl: { fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' },
    inp: { width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
    rel: { position: 'relative' },
    eye: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.muted, display: 'flex' },
    btn: { width: '100%', background: C.orange, border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 20 },
    tabs: { display: 'flex', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 24, overflow: 'hidden' },
    tab: (a) => ({ flex: 1, padding: '10px 0', border: 'none', background: a ? C.orange : 'transparent', color: a ? '#fff' : C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer' }),
    err: { background: '#ff444418', border: '1px solid #ff444466', borderRadius: 8, padding: '10px 14px', color: '#ff7070', fontSize: 13, marginTop: 12 },
    sel: { width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', appearance: 'none' },
  };

  if (firstSetup) return (
    <div style={Sc.screen}><div style={Sc.box}>
      <div style={Sc.logoRow}><div style={Sc.bar}/><span style={Sc.logoTxt}>FUNPARTS</span></div>
      <p style={{ ...Sc.sub, color: C.orange }}>Configuração inicial</p>
      <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 24, lineHeight: 1.7 }}>
        Defina a senha master para começar a usar o sistema.
      </p>
      <div style={{ marginBottom: 14 }}>
        <span style={Sc.lbl}>Nova senha *</span>
        <div style={Sc.rel}>
          <input style={Sc.inp} type={showSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 6 caracteres"/>
          <button style={Sc.eye} onClick={()=>setShowSenha(v=>!v)}>{showSenha?<EyeOff size={15}/>:<Eye size={15}/>}</button>
        </div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <span style={Sc.lbl}>Confirmar senha *</span>
        <input style={Sc.inp} type="password" value={senhaConf} onChange={e=>setSenhaConf(e.target.value)} placeholder="Repita a senha"/>
      </div>
      {erro && <div style={Sc.err}>{erro}</div>}
      <button style={Sc.btn} onClick={doSetup} disabled={loading}>{loading?'Salvando…':'Configurar acesso master'}</button>
    </div></div>
  );

  return (
    <div style={Sc.screen}><div style={Sc.box}>
      <div style={Sc.logoRow}><div style={Sc.bar}/><span style={Sc.logoTxt}>FUNPARTS</span></div>
      <p style={Sc.sub}>Controle de Consignação</p>
      <div style={Sc.tabs}>
        <button style={Sc.tab(tipo==='pdv')} onClick={()=>{setTipo('pdv');setErro('');}}>Ponto de Venda</button>
        <button style={Sc.tab(tipo==='master')} onClick={()=>{setTipo('master');setErro('');}}>Master</button>
      </div>
      {tipo==='pdv' && (
        <div style={{ marginBottom: 14 }}>
          <span style={Sc.lbl}>Ponto de Venda</span>
          <select style={Sc.sel} value={pdvId} onChange={e=>setPdvId(e.target.value)}>
            <option value="">Selecione…</option>
            {pdvList.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 4 }}>
        <span style={Sc.lbl}>Senha</span>
        <div style={Sc.rel}>
          <input style={Sc.inp} type={showSenha?'text':'password'} value={senha}
            onChange={e=>setSenha(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doLogin()}
            placeholder="Digite a senha"/>
          <button style={Sc.eye} onClick={()=>setShowSenha(v=>!v)}>{showSenha?<EyeOff size={15}/>:<Eye size={15}/>}</button>
        </div>
      </div>
      {erro && <div style={Sc.err}>{erro}</div>}
      <button style={Sc.btn} onClick={doLogin} disabled={loading}>{loading?'Entrando…':'Entrar'}</button>
    </div></div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// ACESSOS VIEW
// ────────────────────────────────────────────────────────────────────────────────
function AcessosView({ pdvs }) {
  const [pdvAuths, setPdvAuths] = useState({});
  const [editingPdv, setEditingPdv] = useState(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mSenha, setMSenha] = useState('');
  const [mSenhaC, setMSenhaC] = useState('');
  const [mMsg, setMMsg] = useState('');
  const [mSaving, setMSaving] = useState(false);

  useEffect(() => {
    listAll('auth:pdv:').then(list => {
      const map = {};
      (list||[]).forEach(a => { if(a.pdvId) map[a.pdvId] = a; });
      setPdvAuths(map);
    });
  }, []);

  const togglePerm = async (pvId, key) => {
    const curr = pdvAuths[pvId] || { pdvId: pvId, permissoes: { ...DEFAULT_PERMS } };
    const perms = { ...(curr.permissoes || DEFAULT_PERMS), [key]: !(curr.permissoes?.[key] ?? DEFAULT_PERMS[key]) };
    const upd = { ...curr, permissoes: perms };
    await put('auth:pdv:' + pvId, { ...upd, id: pvId, pdvId: pvId });
    setPdvAuths(prev => ({ ...prev, [pvId]: upd }));
  };

  const saveSenha = async (pvId) => {
    if (!novaSenha.trim()) return;
    setSaving(true);
    const hash = await sha256(novaSenha);
    const curr = pdvAuths[pvId] || { permissoes: { ...DEFAULT_PERMS } };
    const upd = { ...curr, id: pvId, pdvId: pvId, senhaHash: hash };
    await put('auth:pdv:' + pvId, upd);
    setPdvAuths(prev => ({ ...prev, [pvId]: upd }));
    setEditingPdv(null); setNovaSenha(''); setSaving(false);
  };

  const saveMaster = async () => {
    if (mSenha.length < 6) { setMMsg('Mínimo 6 caracteres.'); return; }
    if (mSenha !== mSenhaC) { setMMsg('Senhas não coincidem.'); return; }
    setMSaving(true);
    const hash = await sha256(mSenha);
    await put('auth:master', { id: 'master', senhaHash: hash });
    setMSenha(''); setMSenhaC(''); setMMsg('✓ Senha master atualizada!');
    setMSaving(false);
  };

  const Av = {
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 14, overflow: 'hidden' },
    hd: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.border}` },
    badge: (on) => ({ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: on?'#22c55e20':'#94a3b820', color: on?'#22c55e':C.muted }),
    perms: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px' },
    pBtn: (on) => ({ display:'flex',alignItems:'center',gap:6, padding:'7px 12px', borderRadius:8, background: on?C.orange+'22':C.surface2, border:`1px solid ${on?C.orange:C.border}`, cursor:'pointer', fontSize:12, fontWeight:700, color:on?C.orange:C.muted, userSelect:'none' }),
    passRow: { display: 'flex', gap: 8, padding: '0 18px 14px', alignItems: 'center' },
    inp: { flex:1, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 12px', color:C.text, fontSize:13, outline:'none' },
    sv: { background:C.orange, border:'none', borderRadius:9, padding:'9px 16px', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' },
    cn: { background:C.surface2, border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 12px', color:C.muted, fontWeight:600, fontSize:13, cursor:'pointer' },
    chBtn: { background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', color:C.muted, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 },
  };

  return (
    <div style={{ maxWidth: 740, margin: '0 auto' }}>
      <h2 style={{ color:C.text, fontSize:20, fontWeight:800, marginBottom:6 }}>Controle de Acessos</h2>
      <p style={{ color:C.muted, fontSize:13, marginBottom:24 }}>Gerencie senhas e permissões de cada ponto de venda.</p>

      {pdvs.map(pdv => {
        const av = pdvAuths[pdv.id];
        const configured = !!av?.senhaHash;
        const perms = av?.permissoes || DEFAULT_PERMS;
        const isEd = editingPdv === pdv.id;
        return (
          <div key={pdv.id} style={Av.card}>
            <div style={Av.hd}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Store size={15} color={C.orange}/>
                <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{pdv.nome}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={Av.badge(configured)}>{configured?'Acesso ativo':'Sem acesso'}</span>
                <button style={Av.chBtn} onClick={()=>{ setEditingPdv(isEd?null:pdv.id); setNovaSenha(''); }}>
                  <Lock size={11}/>{configured?'Trocar senha':'Definir senha'}
                </button>
              </div>
            </div>
            {isEd && (
              <div style={Av.passRow}>
                <input style={Av.inp} type={showSenha?'text':'password'} value={novaSenha}
                  onChange={e=>setNovaSenha(e.target.value)}
                  placeholder="Nova senha…"
                  onKeyDown={e=>e.key==='Enter'&&saveSenha(pdv.id)}/>
                <button onClick={()=>setShowSenha(v=>!v)} style={{ background:'none',border:'none',cursor:'pointer',color:C.muted,padding:4,display:'flex' }}>{showSenha?<EyeOff size={14}/>:<Eye size={14}/>}</button>
                <button onClick={()=>saveSenha(pdv.id)} style={Av.sv} disabled={saving}>{saving?'…':'Salvar'}</button>
                <button onClick={()=>setEditingPdv(null)} style={Av.cn}>Cancelar</button>
              </div>
            )}
            <div style={Av.perms}>
              <span style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:1, alignSelf:'center', marginRight:2 }}>Acesso:</span>
              {Object.entries(PERM_LABELS).map(([k,lbl])=>(
                <button key={k} style={Av.pBtn(perms[k]??DEFAULT_PERMS[k])} onClick={()=>togglePerm(pdv.id,k)}>
                  {(perms[k]??DEFAULT_PERMS[k])?<Check size={11}/>:<X size={11}/>}{lbl}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ ...Av.card, marginTop:28 }}>
        <div style={Av.hd}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Shield size={15} color={C.orange}/>
            <span style={{ fontWeight:700, fontSize:15, color:C.text }}>Senha master</span>
          </div>
        </div>
        <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
          <input style={Av.inp} type="password" value={mSenha} onChange={e=>setMSenha(e.target.value)} placeholder="Nova senha master…"/>
          <input style={Av.inp} type="password" value={mSenhaC} onChange={e=>setMSenhaC(e.target.value)} placeholder="Confirmar nova senha…"/>
          {mMsg && <span style={{ fontSize:13, color: mMsg.startsWith('✓')?'#22c55e':'#ff7070' }}>{mMsg}</span>}
          <button onClick={saveMaster} style={{ ...Av.sv, alignSelf:'flex-start' }} disabled={mSaving}>{mSaving?'Salvando…':'Atualizar senha master'}</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
const [auth, setAuth] = useState(() => {
    try { const _s = sessionStorage.getItem('fp_auth'); return _s ? JSON.parse(_s) : null; }
    catch { return null; }
  });
  const handleLogout = () => { sessionStorage.removeItem('fp_auth'); setAuth(null); };
    const [tab, setTab]         = useState("painel");
  const [loading, setLoading] = useState(true);
  const [pdvs, setPdvs]       = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [movs, setMovs]       = useState([]);
  const [toast, setToast]     = useState(null);
  const [storageMode, setStorageMode] = useState(null); // 'firebase'|'local'|'none'
  const [syncing, setSyncing] = useState(false);

  const flash = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const reload = useCallback(async () => {
    const [p, pr, m] = await Promise.all([
      listAll(PFX.pdv), listAll(PFX.prod), listAll(PFX.mov),
    ]);
    setPdvs(byNome(p));
    setProdutos(byNome(pr));
    setMovs(byData(m));
  }, []);

  useEffect(() => {
    (async () => {
      const mode = await probeStorage();
      setStorageMode(mode);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const sync = useCallback(async () => {
    setSyncing(true);
    await reload();
    setSyncing(false);
    flash("Sincronizado");
  }, [reload, flash]);

  // ---------- estoque por (pdv × produto) ----------
  const estoque = useMemo(() => {
    const map = {};
    for (const mv of movs) {
      const k = `${mv.pdvId}|${mv.produtoId}`;
      const q = Number(mv.qtd) || 0;
      map[k] = (map[k] || 0) + (mv.tipo === "entrada" ? q : -q);
    }
    return map;
  }, [movs]);

  const estoqueDe = useCallback(
    (pdvId) =>
      produtos
        .map((pr) => ({ produto: pr, qtd: estoque[`${pdvId}|${pr.id}`] || 0 }))
        .filter((r) => r.qtd > 0),
    [produtos, estoque]
  );

  // ---------- ações — local-first ----------
  const savePdv = async (pdv) => {
    const obj = { id: pdv.id || uid(), ...pdv };
    setPdvs((prev) => byNome(upsert(prev, obj)));
    await put(PFX.pdv + obj.id, obj);
    flash("Ponto de venda salvo");
  };
  const removePdv = async (id) => {
    setPdvs((prev) => prev.filter((x) => x.id !== id));
    await del(PFX.pdv + id);
    flash("Ponto de venda removido", "warn");
  };
  const saveProduto = async (p) => {
    const obj = { id: p.id || uid(), ...p, preco: Number(p.preco) || 0 };
    setProdutos((prev) => byNome(upsert(prev, obj)));
    await put(PFX.prod + obj.id, obj);
    flash("Quadro salvo no catálogo");
  };
  const removeProduto = async (id) => {
    setProdutos((prev) => prev.filter((x) => x.id !== id));
    await del(PFX.prod + id);
    flash("Quadro removido", "warn");
  };
  const addMov = async (mv) => {
    const obj = { id: uid(), ...mv };
    setMovs((prev) => byData([obj, ...prev]));
    await put(PFX.mov + obj.id, obj);
    flash(mv.tipo === "entrada" ? "Envio registrado" : mv.tipo === "saida" ? "Transferência registrada" : "Venda registrada");
  };
  const removeMov = async (id) => {
    setMovs((prev) => prev.filter((x) => x.id !== id));
    await del(PFX.mov + id);
    flash("Lançamento estornado", "warn");
  };

  const seed = async () => {
    const pdv = {
      id: uid(), nome: "Men's House",
      local: "Shopping Cidade Jardim", responsavel: "", contato: "",
    };
    const cat = [
      ["McLaren Senna", "LEGO Speed Champions", 1490],
      ["Ferrari F1",    "LEGO Speed Champions", 1290],
      ["Red Bull RB",   "LEGO Speed Champions", 1290],
      ["Mercedes AMG",  "LEGO Speed Champions", 1290],
    ].map(([nome, modelo, preco]) => ({ id: uid(), nome, modelo, preco }));

    setPdvs((prev) => byNome(upsert(prev, pdv)));
    setProdutos((prev) => byNome([...prev, ...cat]));
    await put(PFX.pdv + pdv.id, pdv);
    for (const pr of cat) await put(PFX.prod + pr.id, pr);
    flash("Dados de exemplo carregados");
  };

  if (loading) return <Splash />;

  if (!auth) return (
    <LoginScreen onLogin={newA => {
      setAuth(newA);
      setTab(
        (NAV_ALL.find(([id]) =>
          id !== 'acessos' &&
          (newA.tipo === 'master' || newA.permissoes?.[id] !== false)
        ) || NAV_ALL[0])?.[0] || 'painel'
      );
    }} />
  );
  const empty = !pdvs.length && !produtos.length && !movs.length;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <style>{globalCss}</style>

      <Header storageMode={storageMode} syncing={syncing} onSync={sync} onLogout={handleLogout} />
      <Nav tab={tab} setTab={setTab} auth={auth} />

      {storageMode === "local" && <LocalBanner />}

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 16px 96px" }}>
        {empty && tab === "painel" && <FirstRun onSeed={seed} setTab={setTab} />}

        {tab === "painel"   && <Painel pdvs={pdvs} produtos={produtos} movs={movs}
                                estoqueDe={estoqueDe} setTab={setTab} />}
        {tab === "pdv"      && <PdvView pdvs={pdvs} onSave={savePdv}
                                onRemove={removePdv} estoqueDe={estoqueDe} onAddMov={addMov} />}
        {tab === "catalogo" && <CatalogoView produtos={produtos}
                                onSave={saveProduto} onRemove={removeProduto} pdvs={pdvs} estoqueDe={estoqueDe} />}
        {tab === "enviar"   && <EnviarView pdvs={pdvs} produtos={produtos} movs={movs}
                                onAdd={addMov} setTab={setTab} />}
        {tab === "vender"   && <VenderView pdvs={pdvs} produtos={produtos}
                                estoqueDe={estoqueDe} onAdd={addMov} setTab={setTab} />}
        {tab === "vendas"   && <VendasView movs={movs} pdvs={pdvs}
                                produtos={produtos} onRemove={removeMov} flash={flash} />}
          {tab === "acessos" && auth?.tipo === "master" && <AcessosView pdvs={pdvs} />}
      </main>

      {toast && <Toast toast={toast} />}
    </div>
  );
}

// ============================================================
//  CHROME
// ============================================================
function Splash() {
  return (
    <div style={{ background: C.bg, color: C.muted, height: "100vh",
      display: "grid", placeItems: "center",
      fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <Wordmark />
        <div style={{ marginTop: 16, fontSize: 13, letterSpacing: 1 }}>carregando…</div>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ fontStyle: "italic", fontWeight: 900, fontSize: 26, letterSpacing: -0.5 }}>
      <span style={{ color: C.text }}>FUN</span>
      <span style={{ color: C.orange }}>PARTS</span>
    </div>
  );
}

function Header({ storageMode, syncing, onSync, onLogout }) {
  const connected = storageMode === "firebase";
  return (
    <header style={{ borderBottom: `1px solid ${C.border}`, background: C.bg,
      position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 26, background: C.orange,
            transform: "skewX(-12deg)" }} />
          <Wordmark />
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 600,
            letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>
            Consignação
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {storageMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: connected ? C.green : C.muted }}>
              {connected
                ? <Wifi size={13} color={C.green} />
                : <WifiOff size={13} color={C.muted} />}
              {connected ? "Firebase ativo" : "Modo local"}
            </div>
          )}
          <button onClick={onSync}
            style={{ display: "flex", alignItems: "center", gap: 7,
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 9, color: C.muted, padding: "8px 12px",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <RefreshCw size={14} color={C.blue}
              style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button onClick={onLogout}
            style={{ display: "flex", alignItems: "center", gap: 6,
              background: "none", border: `1px solid ${C.border}`,
              borderRadius: 9, color: C.muted, padding: "8px 12px",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <LogOut size={14} color={C.muted}/> Sair
          </button>
        </div>
      </div>
    </header>
  );
}

function LocalBanner() {
  return (
    <div style={{ background: `${C.orange}14`, borderBottom: `1px solid ${C.orange}40` }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "9px 16px",
        display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.text }}>
        <AlertTriangle size={15} color={C.orange} style={{ flexShrink: 0 }} />
        <span>
          <b>Modo local:</b> Firebase não configurado — dados ficam só neste
          navegador. Siga o README para conectar o Firebase e sincronizar com as vendedoras.
        </span>
      </div>
    </div>
  );
}

const _CAT_TAG = { quadros: "[Q]", miniaturas: "[M]", capacetes: "[C]" };
const catTag = p => _CAT_TAG[p?.categoria] ? _CAT_TAG[p?.categoria] + " " : "";

const NAV_ALL = [
    ["painel",   "Painel",          LayoutGrid],
    ["vender",   "Vender",          ShoppingBag],
    ["enviar",   "Enviar",          Truck],
    ["pdv",      "Pontos de venda", MapPin],
    ["catalogo", "Catálogo",        Package],
    ["vendas",   "Vendas / NF",     FileText],
    ["acessos",  "Acessos",         Shield],
  ];
  function Nav({ tab, setTab, auth }) {
  const NAV = auth?.tipo === 'master'
    ? NAV_ALL
    : NAV_ALL.filter(([id]) => id !== 'pdv' && id !== 'acessos' && (auth?.permissoes?.[id] !== false));
  return (
    <nav style={{ borderBottom: `1px solid ${C.border}`, background: C.surface,
      position: "sticky", top: 57, zIndex: 25, overflowX: "auto" }} className="no-sb">
      <div style={{ maxWidth: 1080, margin: "0 auto",
        display: "flex", gap: 2, padding: "0 8px" }}>
        {NAV.map(([id, label, Icon]) => {
          const active = tab === id;
          const sell   = id === "vender";
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                whiteSpace: "nowrap", padding: "13px 14px",
                border: "none", background: "transparent", cursor: "pointer",
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                color: active ? C.text : C.muted,
                borderBottom: `2px solid ${active ? (sell ? C.orange : C.blue) : "transparent"}`,
              }}>
              <Icon size={16} color={active ? (sell ? C.orange : C.blue) : C.muted} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Toast({ toast }) {
  const col = toast.kind === "warn" ? C.orange
            : toast.kind === "err"  ? C.red
            : C.green;
  return (
    <div style={{ position: "fixed", bottom: 22, left: "50%",
      transform: "translateX(-50%)", background: C.surface2,
      border: `1px solid ${col}`, color: C.text, padding: "11px 18px",
      borderRadius: 10, fontSize: 14, fontWeight: 600,
      boxShadow: "0 10px 30px rgba(0,0,0,.5)", zIndex: 60,
      display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: col }} />
      {toast.msg}
    </div>
  );
}

// ---------- primitives ----------
function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontStyle: "italic", fontWeight: 900, fontSize: 22,
        letterSpacing: -0.5, textTransform: "uppercase" }}>{children}</h2>
      {sub && <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 13.5 }}>{sub}</p>}
    </div>
  );
}
function Card({ children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 18, ...style }}>{children}</div>
  );
}
function Field({ label, children, req }) {
  return (
    <label style={{ display: "block", marginBottom: 13 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600,
        color: C.muted, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}{req && <span style={{ color: C.orange }}> *</span>}
      </span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: "100%", boxSizing: "border-box", background: C.bg,
  border: `1px solid ${C.border}`, borderRadius: 9, color: C.text,
  padding: "11px 12px", fontSize: 15, outline: "none",
};
function Input(props) {
  return (
    <input {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      onFocus={(e) => (e.target.style.borderColor = C.blue)}
      onBlur={(e)  => (e.target.style.borderColor = C.border)} />
  );
}
function Sel({ children, ...p }) {
  return (
    <select {...p} style={{ ...inputStyle, appearance: "none" }}>
      {children}
    </select>
  );
}
function Btn({ children, onClick, kind = "primary", disabled, full, type = "button" }) {
  const bg  = kind === "primary" ? C.orange : kind === "blue" ? C.blue : "transparent";
  const col = kind === "ghost"   ? C.muted  : "#0B0C0E";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? C.border : bg,
        color: disabled ? C.muted : col,
        border: kind === "ghost" ? `1px solid ${C.border}` : "none",
        padding: "11px 18px", borderRadius: 9, fontWeight: 700, fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        width: full ? "100%" : "auto",
        display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 8,
      }}>
      {children}
    </button>
  );
}
function Empty({ icon: Icon, title, hint, action }) {
  return (
    <Card style={{ textAlign: "center", padding: "40px 20px" }}>
      <Icon size={34} color={C.border} />
      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12 }}>{title}</div>
      {hint && <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>{hint}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </Card>
  );
}
function IconBtn({ children, onClick, title, danger }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${C.border}`, background: C.bg,
        color: danger ? C.red : C.muted, cursor: "pointer",
        display: "grid", placeItems: "center" }}>
      {children}
    </button>
  );
}
function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
        display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: 22, width: "100%", maxWidth: 440,
          maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontStyle: "italic", fontWeight: 900,
            textTransform: "uppercase", fontSize: 18, letterSpacing: -0.3 }}>
            {title}
          </h3>
          <IconBtn onClick={onClose} title="Fechar"><X size={16} /></IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}
function CardHead({ icon: Icon, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
      <Icon size={17} color={C.blue} />
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{title}</h3>
    </div>
  );
}

// ============================================================
//  PRIMEIRO USO
// ============================================================
function FirstRun({ onSeed, setTab }) {
  return (
    <Card style={{ marginBottom: 22, borderColor: `${C.orange}55`,
      background: `linear-gradient(135deg, ${C.surface}, ${C.bg})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 4, height: 20, background: C.orange,
          transform: "skewX(-12deg)" }} />
        <h3 style={{ margin: 0, fontStyle: "italic", fontWeight: 900,
          textTransform: "uppercase", letterSpacing: -0.3 }}>Comece em 3 passos</h3>
      </div>
      <ol style={{ color: C.muted, fontSize: 14, lineHeight: 1.9,
        margin: "8px 0 16px", paddingLeft: 20 }}>
        <li>Cadastre seus <b style={{ color: C.text }}>pontos de venda</b>
          {" "}(ex: Men's House — Cidade Jardim).</li>
        <li>Cadastre os <b style={{ color: C.text }}>quadros</b> no catálogo com preço.</li>
        <li>Use <b style={{ color: C.text }}>Enviar</b> ao despachar para o PDV
          {" "}e <b style={{ color: C.text }}>Vender</b> quando vender.</li>
      </ol>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn kind="blue" onClick={() => setTab("pdv")}>
          <Plus size={16} />Cadastrar PDV
        </Btn>
        <Btn kind="ghost" onClick={onSeed}>Carregar dados de exemplo</Btn>
      </div>
    </Card>
  );
}

// ============================================================
//  PAINEL
// ============================================================
function Painel({ pdvs, produtos, movs, estoqueDe, setTab }) {
  const vendas    = movs.filter((m) => m.tipo === "venda");
  const mesAtual  = today().slice(0, 7);
  const vendasMes = vendas.filter((v) => (v.data || "").slice(0, 7) === mesAtual);
  const valorMes  = vendasMes.reduce((s, v) =>
    s + (Number(v.preco) || 0) * (Number(v.qtd) || 1), 0);
  const unidMes   = vendasMes.reduce((s, v) => s + (Number(v.qtd) || 1), 0);

  let unidEstoque = 0, valorEstoque = 0;
  const porPdv = pdvs.map((p) => {
    const linhas = estoqueDe(p.id);
    const u   = linhas.reduce((s, l) => s + l.qtd, 0);
    const val = linhas.reduce((s, l) => s + l.qtd * (Number(l.produto.preco) || 0), 0);
    unidEstoque += u; valorEstoque += val;
    return { pdv: p, unidades: u, valor: val };
  }).sort((a, b) => b.valor - a.valor);

  const rank = {};
  for (const v of vendas)
    rank[v.produtoId] = (rank[v.produtoId] || 0) + (Number(v.qtd) || 1);
  const ranking = Object.entries(rank)
    .map(([pid, q]) => ({ produto: produtos.find((p) => p.id === pid), q }))
    .filter((r) => r.produto)
    .sort((a, b) => b.q - a.q).slice(0, 6);
  const maxRank = Math.max(1, ...ranking.map((r) => r.q));


  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return produtos
      .filter(p =>
        (p.nome || "").toLowerCase().includes(q) ||
        (p.modelo || "").toLowerCase().includes(q)
      )
      .map(produto => {
        const pdvMap = {};
        movs.forEach(mv => {
          if (mv.produtoId !== produto.id) return;
          if (!pdvMap[mv.pdvId]) pdvMap[mv.pdvId] = { entrada: 0, saida: 0, venda: 0 };
          const n = Number(mv.qtd) || 0;
          if (mv.tipo === "entrada")     pdvMap[mv.pdvId].entrada += n;
          else if (mv.tipo === "saida")  pdvMap[mv.pdvId].saida += n;
          else if (mv.tipo === "venda")  pdvMap[mv.pdvId].venda += n;
        });
        const locs = pdvs
          .map(pdv => ({
            pdv,
            stock: (pdvMap[pdv.id]?.entrada || 0)
                 - (pdvMap[pdv.id]?.saida   || 0)
                 - (pdvMap[pdv.id]?.venda   || 0),
            vendas: pdvMap[pdv.id]?.venda || 0,
          }))
          .filter(l => l.stock > 0 || l.vendas > 0);
        return { produto, locs };
      });
  }, [query, produtos, pdvs, movs]);
    return (
    <>

      {/* ── BUSCA ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 14,
            top: "50%", transform: "translateY(-50%)",
            color: C.muted, pointerEvents: "none" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto, modelo ou pedido…"
            style={{ width: "100%", boxSizing: "border-box",
              padding: "12px 14px 12px 42px", background: C.surface,
              border: `1px solid ${query ? C.orange : C.border}`,
              borderRadius: 10, color: C.text, fontSize: 14,
              outline: "none", transition: "border-color 0.2s" }}
          />
          {query && (
            <button onClick={() => setQuery("")}
              style={{ position: "absolute", right: 12, top: "50%",
                transform: "translateY(-50%)", background: "none",
                border: "none", color: C.muted, cursor: "pointer",
                display: "grid", placeItems: "center" }}>
              <X size={14} />
            </button>
          )}
        </div>
        {query.trim() && (
          <div style={{ marginTop: 8, background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 12,
            overflow: "hidden" }}>
            {results.length === 0
              ? <p style={{ color: C.muted, textAlign: "center",
                  padding: "20px 0", fontSize: 13, margin: 0 }}>
                  Nenhum resultado para "{query}"
                </p>
              : results.map(({ produto, locs }) => (
                <div key={produto.id} style={{ padding: "14px 16px",
                  borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{catTag(produto)}{produto.nome}</span>
                      {produto.modelo && (
                        <span style={{ color: C.muted, fontSize: 12.5,
                          marginLeft: 8 }}>{produto.modelo}</span>
                      )}
                    </div>
                    <span style={{ color: C.orange, fontWeight: 700,
                      fontSize: 13, fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap", marginLeft: 8 }}>
                      {brl(produto.preco)}
                    </span>
                  </div>
                  {locs.length === 0
                    ? <span style={{ color: C.muted, fontSize: 12.5 }}>
                        Sem movimentações registradas
                      </span>
                    : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {locs.map(loc => (
                          <div key={loc.pdv.id} style={{
                            background: loc.stock > 0 ? C.orange + "18" : C.surface2,
                            border: `1px solid ${loc.stock > 0 ? C.orange : C.border}`,
                            borderRadius: 8, padding: "7px 12px" }}>
                            <div style={{ fontWeight: 600, fontSize: 12,
                              color: loc.stock > 0 ? C.orange : C.muted,
                              display: "flex", alignItems: "center", gap: 4 }}>
                              <MapPin size={10} />{loc.pdv.nome}
                            </div>
                            <div style={{ fontSize: 11.5, marginTop: 2,
                              color: loc.stock > 0 ? C.text : C.muted,
                              fontVariantNumeric: "tabular-nums" }}>
                              {loc.stock > 0
                                ? `Em estoque · ${loc.stock} un`
                                : `Vendido · ${loc.vendas} un`}
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              ))
            }
          </div>
        )}
      </div>
      <SectionTitle sub="Visão geral do que está na rua e do que já vendeu.">Painel</SectionTitle>

      <div style={{ display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
        gap: 12, marginBottom: 22 }}>
        <Stat label="Em consignação" value={brl(valorEstoque)}
          foot={`${unidEstoque} quadros na rua`} accent={C.blue} />
        <Stat label="Vendas no mês" value={brl(valorMes)}
          foot={`${unidMes} vendidos`} accent={C.orange} />
        <Stat label="Pontos de venda" value={pdvs.length}
          foot="ativos" accent={C.blueSoft} />
        <Stat label="Catálogo" value={produtos.length}
          foot="quadros cadastrados" accent={C.muted} />
      </div>

      <div style={{ display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <Card>
          <CardHead icon={Boxes} title="Estoque por ponto de venda" />
          {porPdv.length === 0
            ? <p style={{ color: C.muted, fontSize: 14 }}>Nenhum quadro enviado ainda.</p>
            : porPdv.map(({ pdv, unidades, valor }) => (
              <div key={pdv.id} onClick={() => setTab("pdv")}
                style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "11px 0",
                  borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{pdv.nome}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{pdv.local || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {unidades} un
                  </div>
                  <div style={{ color: C.blue, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                    {brl(valor)}
                  </div>
                </div>
              </div>
            ))
          }
        </Card>

        <Card>
          <CardHead icon={TrendingUp} title="Mais vendidos" />
          {ranking.length === 0
            ? <p style={{ color: C.muted, fontSize: 14 }}>Sem vendas registradas ainda.</p>
            : ranking.map((r) => (
              <div key={r.produto.id} style={{ marginBottom: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  fontSize: 13.5, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{r.produto.nome}</span>
                  <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                    {r.q} un
                  </span>
                </div>
                <div style={{ height: 7, background: C.bg, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${(r.q / maxRank) * 100}%`, height: "100%",
                    background: `linear-gradient(90deg,${C.orange},${C.blueSoft})`,
                    borderRadius: 99 }} />
                </div>
              </div>
            ))
          }
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, foot, accent }) {
  return (
    <Card style={{ padding: 16, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0,
        width: 3, height: "100%", background: accent }} />
      <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 600,
        letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, margin: "6px 0 2px",
        fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{foot}</div>
    </Card>
  );
}

// ============================================================
//  PONTOS DE VENDA
// ============================================================
function PdvView({ pdvs, onSave, onRemove, estoqueDe, onAddMov }) {
  const [form, setForm] = useState(null);
  const [selectedPdv, setSelectedPdv] = useState(null);
  const blank = { nome: "", local: "", responsavel: "", contato: "" };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start" }}>
        <SectionTitle sub="Lojas e showrooms onde seus quadros ficam à venda.">
          Pontos de venda
        </SectionTitle>
        <Btn onClick={() => setForm(blank)}><Plus size={16} />Novo</Btn>
      </div>

      {form && (
        <Modal
          title={form.id ? "Editar ponto de venda" : "Novo ponto de venda"}
          onClose={() => setForm(null)}>
          <Field label="Nome da loja" req>
            <Input value={form.nome} placeholder="Men's House"
              onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Local / shopping">
            <Input value={form.local} placeholder="Shopping Cidade Jardim"
              onChange={(e) => setForm({ ...form, local: e.target.value })} />
          </Field>
          <Field label="Responsável / vendedora">
            <Input value={form.responsavel}
              onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          </Field>
          <Field label="Contato (WhatsApp / e-mail)">
            <Input value={form.contato}
              onChange={(e) => setForm({ ...form, contato: e.target.value })} />
          </Field>
          <Btn full disabled={!form.nome.trim()}
            onClick={async () => { await onSave(form); setForm(null); }}>
            Salvar
          </Btn>
        </Modal>
      )}

      {pdvs.length === 0
        ? <Empty icon={Store} title="Nenhum ponto de venda"
            hint="Cadastre a primeira loja para começar a despachar quadros."
            action={<Btn onClick={() => setForm(blank)}><Plus size={16} />Cadastrar</Btn>} />
        : (
          <div style={{ display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
            {pdvs.map((p) => {
              const linhas = estoqueDe(p.id);
              const un = linhas.reduce((s, l) => s + l.qtd, 0);
              return (
                <Card key={p.id}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <MapPin size={18} color={C.orange} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nome}</div>
                        <div style={{ color: C.muted, fontSize: 13 }}>{p.local || "—"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn onClick={() => setForm(p)} title="Editar"><User size={14} /></IconBtn>
                      <IconBtn onClick={() => onRemove(p.id)} title="Remover" danger>
                        <Trash2 size={14} />
                      </IconBtn>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 12,
                    borderTop: `1px solid ${C.border}`,
                    display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: C.muted }}>
                      {p.responsavel || "sem responsável"}
                    </span>
                    <span style={{ fontWeight: 700,
                      color: un ? C.blue : C.muted, fontVariantNumeric: "tabular-nums" }}>
                      {un} em estoque
                    </span>
                  </div>
                
            <button onClick={() => setSelectedPdv(p)}
              style={{ marginTop: 12, width: "100%", padding: "10px 0",
                background: C.orange, color: "#fff", border: "none",
                borderRadius: 8, fontWeight: 700, fontSize: 13,
                letterSpacing: "0.05em", cursor: "pointer" }}>
              GERENCIAR ESTOQUE
            </button>
          </Card>
              );
            })}
          </div>
        )
      }
    
  {selectedPdv && (
    <PdvDetalhe pdv={selectedPdv} pdvs={pdvs} estoqueDe={estoqueDe} onAddMov={onAddMov} onClose={() => setSelectedPdv(null)} />
  )}
  </>
  );
}

// ============================================================
//  CATÁLOGO

// ============================================================
// PDV DETALHE
// ============================================================
function PdvDetalhe({ pdv, pdvs, estoqueDe, onAddMov, onClose }) {
  const [transfer, setTransfer] = useState(null);
  const linhas = estoqueDe(pdv.id);
  const total = linhas.reduce((s, l) => s + l.qtd, 0);
  const valor = linhas.reduce((s, l) => s + l.qtd * (Number(l.produto.preco) || 0), 0);
  const otherPdvs = (pdvs || []).filter(p => p.id !== pdv.id);

  const doTransfer = async () => {
    if (!transfer?.destId || transfer.qty < 1) return;
    const { produtoId, qty, destId } = transfer;
    const dt = today();
    await onAddMov({ tipo: "saida", pdvId: pdv.id, produtoId, qtd: qty, data: dt });
    await onAddMov({ tipo: "entrada", pdvId: destId, produtoId, qtd: qty, data: dt });
    setTransfer(null);
  };

  return (
    <Modal title={`Estoque — ${pdv.nome}`} onClose={onClose}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between",
        fontSize: 13, color: C.muted }}>
        <span>{pdv.local || "—"}</span>
        <span><b style={{ color: C.text }}>{total}</b> quadros ·{" "}
          <b style={{ color: C.blue }}>{brl(valor)}</b></span>
      </div>
      {linhas.length === 0
        ? <p style={{ color: C.muted, textAlign: "center", padding: "24px 0" }}>Sem estoque neste PDV.</p>
        : linhas.map(({ produto, qtd }) => {
          const isT = transfer?.produtoId === produto.id;
          return (
            <div key={produto.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "11px 0" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{catTag(produto)}{produto.nome}</div>
                  <div style={{ color: C.muted, fontSize: 12.5 }}>{brl(produto.preco)} cada</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: C.orange,
                      fontVariantNumeric: "tabular-nums" }}>{qtd}</div>
                    <div style={{ color: C.blue, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                      {brl(qtd * (Number(produto.preco) || 0))}
                    </div>
                  </div>
                  <button onClick={() => setTransfer(isT ? null : { produtoId: produto.id, qty: 1, destId: "" })}
                    title="Transferir para outro PDV"
                    style={{ width: 32, height: 32, borderRadius: 8,
                      border: `1px solid ${isT ? C.orange : C.border}`,
                      background: isT ? C.orange + "22" : C.bg,
                      color: isT ? C.orange : C.muted,
                      cursor: "pointer", display: "grid", placeItems: "center",
                      transition: "all 0.15s" }}>
                    <Truck size={14} />
                  </button>
                </div>
              </div>
              {isT && (
                <div style={{ paddingBottom: 14, display: "flex", gap: 8, alignItems: "center",
                  flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <select value={transfer.destId}
                    onChange={(e) => setTransfer({ ...transfer, destId: e.target.value })}
                    style={{ flex: 1, minWidth: 130, ...inputStyle,
                      fontSize: 13, padding: "8px 10px", appearance: "none" }}>
                    <option value="">→ Destino…</option>
                    {otherPdvs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <input type="number" min={1} max={qtd} value={transfer.qty}
                    onChange={(e) => setTransfer({ ...transfer,
                      qty: Math.min(qtd, Math.max(1, parseInt(e.target.value) || 1)) })}
                    style={{ width: 60, ...inputStyle, fontSize: 14,
                      padding: "8px 10px", textAlign: "center" }} />
                  <button onClick={doTransfer} disabled={!transfer.destId}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none",
                      background: transfer.destId ? C.orange : C.border,
                      color: transfer.destId ? "#fff" : C.muted,
                      fontWeight: 700, fontSize: 13,
                      cursor: transfer.destId ? "pointer" : "not-allowed",
                      transition: "opacity 0.15s" }}>
                    Transferir
                  </button>
                </div>
              )}
            </div>
          );
        })
      }
    </Modal>
  );
}


function CatalogoView({ produtos, onSave, onRemove, pdvs, estoqueDe }) {
  const [form, setForm] = useState(null);

  const CATS = [
    { key: "quadros-prontos", label: "Quadros prontos" },
    { key: "somente-quadros", label: "Somente quadros" },
    { key: "miniaturas",      label: "Miniaturas" },
  ];

  const catProds = (key) =>
    produtos.filter(p => (p.categoria || "quadros-prontos") === key);

  const blank = { nome: "", modelo: "", preco: "", qtd: "", categoria: "quadros-prontos" };

  const save = () => {
    if (!form.nome.trim() || !form.preco) return;
    onSave(form);
    setForm(null);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 22, letterSpacing: "0.04em",
            color: C.text, margin: 0 }}>CATÁLOGO</h2>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            Produtos disponíveis para consignação.</p>
        </div>
        <Btn onClick={() => setForm({ ...blank })}>+ Novo</Btn>
      </div>

      {pdvs && pdvs.length > 0 && estoqueDe && (
        <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
          {pdvs.map(pdv => {
            const linhas = estoqueDe(pdv.id);
            const tot = linhas.reduce((s, l) => s + l.qtd, 0);
            const val = linhas.reduce((s, l) => s + l.qtd * (Number(l.produto.preco) || 0), 0);
            return (
              <div key={pdv.id} style={{ background: C.surface2,
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "12px 16px", flex: "1 1 150px" }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  marginBottom: 4 }}>{pdv.nome}</div>
                <div style={{ fontWeight: 800, fontSize: 22, color: C.orange,
                  fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{tot}</div>
                <div style={{ fontSize: 11.5, color: C.blue, marginTop: 2,
                  fontVariantNumeric: "tabular-nums" }}>{brl(val)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: 18, alignItems: "start" }}>
        {CATS.map(cat => {
          const prods = catProds(cat.key);
          return (
            <div key={cat.key} style={{ background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "11px 14px",
                borderBottom: `1px solid ${C.border}`,
                background: C.surface2,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 12.5,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  color: C.orange }}>{cat.label}</span>
                <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600,
                  background: C.bg, borderRadius: 20, padding: "2px 8px" }}>
                  {prods.length}
                </span>
              </div>
              {prods.length === 0
                ? <p style={{ color: C.muted, fontSize: 12.5, textAlign: "center",
                    padding: "18px 0", margin: 0 }}>Nenhum produto</p>
                : prods.map(p => (
                  <div key={p.id} style={{ padding: "9px 14px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13,
                        whiteSpace: "nowrap", overflow: "hidden",
                        textOverflow: "ellipsis" }}>{p.nome}</div>
                      <div style={{ color: C.muted, fontSize: 11.5,
                        fontVariantNumeric: "tabular-nums" }}>{brl(p.preco)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 7, padding: "4px 7px" }}>
                      <span style={{ color: C.muted, fontSize: 10, fontWeight: 700,
                        letterSpacing: 0.5, textTransform: "uppercase" }}>Qtd</span>
                      <input type="number" min={0}
                        defaultValue={p.qtd || 0}
                        onBlur={(e) => onSave({ ...p, qtd: Number(e.target.value) })}
                        style={{ width: 32, background: "transparent", border: "none",
                          color: C.blue, fontSize: 14, fontWeight: 800,
                          textAlign: "center", outline: "none",
                          fontVariantNumeric: "tabular-nums" }} />
                    </div>
                    <IconBtn onClick={() => setForm({ ...p })} title="Editar">
                      <Pencil size={13} />
                    </IconBtn>
                    <IconBtn onClick={() => onRemove(p.id)} title="Remover">
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                ))
              }
            </div>
          );
        })}
      </div>

      {form && (
        <Modal title={form.id ? "Editar produto" : "Novo produto"}
          onClose={() => setForm(null)}>
          <Field label="Nome do produto">
            <Input value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Modelo / Referência">
            <Input value={form.modelo}
              onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </Field>
          <Field label="Categoria">
            <select value={form.categoria || "quadros-prontos"}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              style={{ ...inputStyle, width: "100%", appearance: "none",
                WebkitAppearance: "none", cursor: "pointer" }}>
              <option value="quadros-prontos">Quadros prontos</option>
              <option value="somente-quadros">Somente quadros</option>
              <option value="miniaturas">Miniaturas</option>
            </select>
          </Field>
          <Field label="Preço de venda (R$)">
            <Input type="number" min={0} value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })} />
          </Field>
          <Field label="Qtd. em mãos">
            <Input type="number" min={0} value={form.qtd || ""} placeholder="0"
              onChange={(e) => setForm({ ...form, qtd: e.target.value })} />
          </Field>
          <Btn full disabled={!form.nome.trim() || !form.preco} onClick={save}>
            {form.id ? "Salvar" : "Adicionar"}
          </Btn>
        </Modal>
      )}
    </>
  );
}


function EnviarView({ pdvs, produtos, movs, onAdd, setTab }) {
  const [pdvId,     setPdvId]     = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd,       setQtd]       = useState(1);
  const [data,      setData]      = useState(today());

  const ready = pdvs.length && produtos.length;
  const _enviados = {};
  for (const mv of movs) {
    if (mv.tipo === "entrada") _enviados[mv.produtoId] = (_enviados[mv.produtoId] || 0) + Number(mv.qtd || 0);
  }
  const produtosDisp = produtos.filter(p => Number(p.qtd || 0) > (_enviados[p.id] || 0));
  const valid = pdvId && produtoId && qtd > 0;

  if (!ready) return (
    <>
      <SectionTitle>Enviar quadros</SectionTitle>
      <Empty icon={Truck} title="Cadastre o básico primeiro"
        hint="Você precisa de pelo menos um ponto de venda e um quadro no catálogo."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <Btn kind="blue"  onClick={() => setTab("pdv")}>Pontos de venda</Btn>
            <Btn kind="ghost" onClick={() => setTab("catalogo")}>Catálogo</Btn>
          </div>
        } />
    </>
  );

  return (
    <>
      <SectionTitle sub="Registre os quadros que saem da fábrica para a loja.">
        Enviar quadros
      </SectionTitle>
      <Card style={{ maxWidth: 460 }}>
        <Field label="Ponto de venda" req>
          <Sel value={pdvId} onChange={(e) => setPdvId(e.target.value)}>
            <option value="">Selecione…</option>
            {pdvs.map((p) =>
              <option key={p.id} value={p.id}>{p.nome} — {p.local}</option>)}
          </Sel>
        </Field>
        <Field label="Quadro" req>
          <Sel value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">Selecione…</option>
            {produtosDisp.map((p) =>
              <option key={p.id} value={p.id}>{catTag(p)}{p.nome} ({brl(p.preco)})</option>)}
          </Sel>
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Quantidade" req>
              <Input type="number" min={1} value={qtd}
                onChange={(e) => setQtd(parseInt(e.target.value) || 1)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Data do envio">
              <Input type="date" value={data}
                onChange={(e) => setData(e.target.value)} />
            </Field>
          </div>
        </div>
        <Btn kind="blue" full disabled={!valid}
          onClick={async () => {
            await onAdd({ tipo: "entrada", pdvId, produtoId, qtd, data });
            setProdutoId(""); setQtd(1);
          }}>
          <Truck size={16} />Registrar envio
        </Btn>
      </Card>
    </>
  );
}

// ============================================================
//  VENDER
// ============================================================
function VenderView({ pdvs, produtos, estoqueDe, onAdd, setTab }) {
  const [step,      setStep]  = useState(1);
  const [pdvId,     setPdvId] = useState("");
  const [cart, setCart] = useState([]);
  const toggleCart = id => setCart(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const [data,      setData]  = useState(today());
  const [cli,       setCli]   = useState(
    { nome: "", cpf: "", email: "", telefone: "", rua: "", complemento: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" }
  );

  const disponiveis = pdvId ? estoqueDe(pdvId) : [];
  const prod = cart.length === 1 ? produtos.find(p => p.id === cart[0]) : null;
  const cartTotal = cart.reduce((sum, pid) => {
    const p = produtos.find(x => x.id === pid);
    return sum + (p?.preco || 0);
  }, 0);
  const cliValido = cli.nome.trim() && cli.cpf.trim() && cli.rua.trim() && cli.numero.trim() && cli.bairro.trim() && cli.cidade.trim() && cli.estado.trim() && cli.cep.trim();

  const reset = () => {
    setStep(1); setCart([]); setData(today());
    setCli({ nome: "", cpf: "", email: "", telefone: "", endereco: "" });
  };

  if (!pdvs.length) return (
    <>
      <SectionTitle>Registrar venda</SectionTitle>
      <Empty icon={ShoppingBag} title="Nenhum ponto de venda"
        hint="Cadastre uma loja antes de registrar vendas."
        action={<Btn onClick={() => setTab("pdv")}>Cadastrar PDV</Btn>} />
    </>
  );

  return (
    <>
      <SectionTitle sub="Vendeu? Registre aqui — os dados saem prontos para a nota fiscal.">
        Registrar venda
      </SectionTitle>
      <Steps step={step} />
      <Card style={{ maxWidth: 520 }}>

        {step === 1 && (
          <>
            <Field label="Em qual loja?" req>
              <Sel value={pdvId}
                onChange={(e) => { setPdvId(e.target.value); setCart([]); }}>
                <option value="">Selecione…</option>
                {pdvs.map((p) =>
                  <option key={p.id} value={p.id}>{p.nome} — {p.local}</option>)}
              </Sel>
            </Field>

            {pdvId && (
              <Field label="Qual quadro foi vendido?" req>
                {disponiveis.length === 0
                  ? (
                    <div style={{ color: C.orange, fontSize: 13.5,
                      display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                      <AlertTriangle size={15} />
                      Sem estoque registrado nesta loja.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {disponiveis.map(({ produto, qtd }) => {
                        const sel = cart.includes(produto.id);
                        return (
                          <button key={produto.id} onClick={() => toggleCart(produto.id)}
                            style={{ textAlign: "left", padding: "12px 14px",
                              borderRadius: 10,
                              border: `1.5px solid ${sel ? C.orange : C.border}`,
                              background: sel ? `${C.orange}18` : C.bg,
                              cursor: "pointer", display: "flex",
                              justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 600, color: C.text, fontSize: 14.5 }}>
                                {produto.nome}
                              </div>
                              <div style={{ color: C.muted, fontSize: 12.5 }}>
                                {brl(produto.preco)}
                              </div>
                            </div>
                            <span style={{ fontSize: 12, color: C.blue,
                              fontVariantNumeric: "tabular-nums" }}>
                              {qtd} disp.
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                }
              </Field>
            )}

            <Field label="Data da venda">
              <Input type="date" value={data}
                onChange={(e) => setData(e.target.value)} />
            </Field>
            <Btn full disabled={!pdvId || cart.length === 0} onClick={() => setStep(2)}>
              Continuar
            </Btn>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: C.muted }}>{prod?.nome || (cart.length > 1 ? cart.length + " produtos" : "—")}</span>
              
              <span style={{ fontWeight: 700, color: C.orange }}>{brl(cartTotal)}</span>
            </div>

            <Field label="Nome completo do cliente" req>
              <Input value={cli.nome}
                onChange={(e) => setCli({ ...cli, nome: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="CPF" req>
                  <Input value={cli.cpf} inputMode="numeric" placeholder="000.000.000-00"
                    onChange={(e) => setCli({ ...cli, cpf: maskCPF(e.target.value) })} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Telefone">
                  <Input value={cli.telefone} inputMode="numeric"
                    placeholder="(11) 90000-0000"
                    onChange={(e) =>
                      setCli({ ...cli, telefone: maskPhone(e.target.value) })} />
                </Field>
              </div>
            </div>
            <Field label="E-mail">
              <Input type="email" value={cli.email} placeholder="cliente@email.com"
                onChange={(e) => setCli({ ...cli, email: e.target.value })} />
            </Field>
            <Field label="Rua / Avenida *">
                <Input value={cli.rua}
                  onChange={(e) => setCli({ ...cli, rua: e.target.value })}
                  placeholder="Ex: Alameda Joaquim Eugênio de Lima" />
              </Field>
              <Field label="Complemento"><Input value={cli.complemento} onChange={(e) => setCli({ ...cli, complemento: e.target.value })} placeholder="Apto, Bloco, Casa..." /></Field>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: "0 0 100px" }}>
                  <Field label="Número *">
                    <Input value={cli.numero}
                      onChange={(e) => setCli({ ...cli, numero: e.target.value })}
                      placeholder="984" />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Bairro *">
                    <Input value={cli.bairro}
                      onChange={(e) => setCli({ ...cli, bairro: e.target.value })}
                      placeholder="Jardim Paulista" />
                  </Field>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Cidade *">
                    <Input value={cli.cidade}
                      onChange={(e) => setCli({ ...cli, cidade: e.target.value })}
                      placeholder="São Paulo" />
                  </Field>
                </div>
                <div style={{ flex: "0 0 80px" }}>
                  <Field label="Estado *">
                    <Input value={cli.estado} maxLength={2}
                      onChange={(e) => setCli({ ...cli, estado: e.target.value.toUpperCase() })}
                      placeholder="SP" />
                  </Field>
                </div>
                <div style={{ flex: "0 0 120px" }}>
                  <Field label="CEP *">
                    <Input value={cli.cep} maxLength={9}
                      onChange={(e) => setCli({ ...cli, cep: e.target.value })}
                      placeholder="00000-000" />
                  </Field>
                </div>
              </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="ghost" onClick={() => setStep(1)}>Voltar</Btn>
              <div style={{ flex: 1 }}>
                <Btn full disabled={!cliValido}
                  onClick={async () => {
                    for (const _pid of cart) {
                    const _p = produtos.find(x => x.id === _pid);
                    await onAdd({
                      tipo: "venda", pdvId, produtoId: _pid, qtd: 1,
                      data, preco: _p?.preco,
                      cliente: cli,
                    });
                  }
                    reset();
                  }}>
                  <Check size={16} />Confirmar venda
                </Btn>
              </div>
            </div>
            {!cliValido && (
              <p style={{ color: C.muted, fontSize: 12,
                marginTop: 8, textAlign: "center" }}>
                Nome e CPF são obrigatórios para emitir a nota.
              </p>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Steps({ step }) {
  const items = [["1", "Loja e quadro"], ["2", "Dados do cliente"]];
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16, maxWidth: 520 }}>
      {items.map(([n, label]) => {
        const active = String(step) === n;
        const done   = step > Number(n);
  
        return (
          <div key={n} style={{ flex: 1, display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 99,
              display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800,
              background: done ? C.green : active ? C.orange : C.surface2,
              color: done || active ? "#0B0C0E" : C.muted,
              border: `1px solid ${C.border}` }}>
              {done ? <Check size={14} /> : n}
            </div>
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? C.text : C.muted }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
//  VENDAS / NF
// ============================================================
function VendasView({ movs, pdvs, produtos, onRemove, flash }) {
  const [q,        setQ]        = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const pdvNome  = (id) => pdvs.find((p) => p.id === id)?.nome || "—";
  const prodNome = (id) => produtos.find((p) => p.id === id)?.nome || "—";

  const vendas   = movs.filter((m) => m.tipo === "venda");
  const filtered = vendas.filter((v) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (v.cliente?.nome || "").toLowerCase().includes(s)
      || (v.cliente?.cpf || "").includes(s)
      || prodNome(v.produtoId).toLowerCase().includes(s)
      || pdvNome(v.pdvId).toLowerCase().includes(s);
  });

  const copyCliente = (v) => {
    const c   = v.cliente || {};
    const txt = [
      `Cliente: ${c.nome || ""}`,
      `CPF: ${c.cpf || ""}`,
      `E-mail: ${c.email || ""}`,
      `Telefone: ${c.telefone || ""}`,
      `Endereço: ${c.endereco || ""}`,
      `Produto: ${prodNome(v.produtoId)}`,
      `Valor: ${brl(v.preco)}`,
      `Loja: ${pdvNome(v.pdvId)}`,
      `Data: ${fmtDate(v.data)}`,
    ].join("\n");
    navigator.clipboard?.writeText(txt);
    setCopiedId(v.id);
    flash("Dados copiados — cole no Bling");
    setTimeout(() => setCopiedId(null), 1800);
  };

  const exportCsv = () => {
    const head = ["Data","Cliente","CPF","Email","Telefone",
      "Endereço","Produto","Valor","Loja"];
    const rows = filtered.map((v) => {
      const c = v.cliente || {};
      return [fmtDate(v.data), c.nome, c.cpf, c.email, c.telefone, c.endereco,
        prodNome(v.produtoId),
        String(v.preco).replace(".", ","),
        pdvNome(v.pdvId)]
        .map((x) => `"${(x || "").toString().replace(/"/g, '""')}"`).join(";");
    });
    const csv  = "\uFEFF" + [head.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `funparts_vendas_${today()}.csv`;
    a.click();
    flash("Planilha exportada");
  };

  const totalFiltrado = filtered.reduce((s, v) => s + (Number(v.preco) || 0), 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <SectionTitle sub="Cada venda traz os dados prontos para emitir a nota fiscal.">
          Vendas / Nota fiscal
        </SectionTitle>
        {vendas.length > 0 && (
          <Btn kind="blue" onClick={exportCsv}>
            <Download size={16} />Exportar CSV
          </Btn>
        )}
      </div>

      {vendas.length === 0
        ? <Empty icon={FileText} title="Nenhuma venda registrada"
            hint="Quando uma venda for registrada, ela aparece aqui com os dados do cliente." />
        : (
          <>
            <div style={{ position: "relative", marginBottom: 14, maxWidth: 420 }}>
              <Search size={16} color={C.muted}
                style={{ position: "absolute", left: 12, top: 13 }} />
              <Input value={q}
                placeholder="Buscar por cliente, CPF, quadro ou loja…"
                onChange={(e) => setQ(e.target.value)}
                style={{ paddingLeft: 36 }} />
            </div>

            <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
              {filtered.length} venda(s) ·{" "}
              <b style={{ color: C.text }}>{brl(totalFiltrado)}</b>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map((v) => {
                const c = v.cliente || {};
                return (
                  <Card key={v.id} style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>
                          {c.nome || "—"}
                        </div>
                        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                          {prodNome(v.produtoId)} · {pdvNome(v.pdvId)} · {fmtDate(v.data)}
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, color: C.orange,
                        fontVariantNumeric: "tabular-nums" }}>
                        {brl(v.preco)}
                      </span>
                    </div>

                    <div style={{ display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                      gap: "6px 16px", marginTop: 12, paddingTop: 12,
                      borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                      <KV k="CPF"       v={c.cpf} />
                      <KV k="Telefone"  v={c.telefone} />
                      <KV k="E-mail"    v={c.email} />
                      <KV k="Endereço"  v={c.endereco} />
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <Btn kind="ghost" onClick={() => copyCliente(v)}>
                        {copiedId === v.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === v.id ? "Copiado" : "Copiar p/ NF"}
                      </Btn>
                      <IconBtn onClick={() => onRemove(v.id)}
                        title="Estornar venda" danger>
                        <Trash2 size={14} />
                      </IconBtn>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )
      }
    </>
  );
}

function KV({ k, v }) {
  return (
    <div>
      <span style={{ color: C.muted, fontSize: 11.5 }}>{k}: </span>
      <span style={{ color: C.text }}>{v || "—"}</span>
    </div>
  );
}

// ============================================================
//  CSS GLOBAL
// ============================================================
const globalCss = `
  * { box-sizing: border-box; }
  .no-sb::-webkit-scrollbar { height: 0; }
  select option { background: ${C.surface}; color: ${C.text}; }
  input::placeholder { color: ${C.muted}; opacity: .7; }
  body { margin: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
