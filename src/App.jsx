import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutGrid, Store, Package, Truck, ShoppingBag, FileText,
  Plus, Trash2, X, Copy, Check, Download, MapPin, User, Search,
  TrendingUp, AlertTriangle, Boxes, RefreshCw, Wifi, WifiOff,
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
export default function App() {
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
    flash(mv.tipo === "entrada" ? "Envio registrado" : "Venda registrada");
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

  const empty = !pdvs.length && !produtos.length && !movs.length;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <style>{globalCss}</style>

      <Header storageMode={storageMode} syncing={syncing} onSync={sync} />
      <Nav tab={tab} setTab={setTab} />

      {storageMode === "local" && <LocalBanner />}

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 16px 96px" }}>
        {empty && tab === "painel" && <FirstRun onSeed={seed} setTab={setTab} />}

        {tab === "painel"   && <Painel pdvs={pdvs} produtos={produtos} movs={movs}
                                estoqueDe={estoqueDe} setTab={setTab} />}
        {tab === "pdv"      && <PdvView pdvs={pdvs} onSave={savePdv}
                                onRemove={removePdv} estoqueDe={estoqueDe} />}
        {tab === "catalogo" && <CatalogoView produtos={produtos}
                                onSave={saveProduto} onRemove={removeProduto} />}
        {tab === "enviar"   && <EnviarView pdvs={pdvs} produtos={produtos}
                                onAdd={addMov} setTab={setTab} />}
        {tab === "vender"   && <VenderView pdvs={pdvs} produtos={produtos}
                                estoqueDe={estoqueDe} onAdd={addMov} setTab={setTab} />}
        {tab === "vendas"   && <VendasView movs={movs} pdvs={pdvs}
                                produtos={produtos} onRemove={removeMov} flash={flash} />}
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

function Header({ storageMode, syncing, onSync }) {
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

const NAV = [
  ["painel",   "Painel",         LayoutGrid],
  ["vender",   "Vender",         ShoppingBag],
  ["enviar",   "Enviar",         Truck],
  ["pdv",      "Pontos de venda",Store],
  ["catalogo", "Catálogo",       Package],
  ["vendas",   "Vendas / NF",    FileText],
];

function Nav({ tab, setTab }) {
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

  return (
    <>
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
//  PONTOS DE VENDA — DETALHE
// ============================================================
function PdvDetalhe({ pdv, estoqueDe, onBack, onEdit, onRemove }) {
  const linhas = estoqueDe(pdv.id);
  const totalUn = linhas.reduce((s, l) => s + l.qtd, 0);
  const totalVal = linhas.reduce((s, l) => s + l.qtd * (l.produto.preco || 0), 0);

  return (
    <>
      {/* breadcrumb / voltar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.muted, cursor: "pointer", padding: "6px 12px", fontSize: 13,
            display: "flex", alignItems: "center", gap: 6 }}>
          ← Pontos de venda
        </button>
        <span style={{ color: C.muted, fontSize: 13 }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{pdv.nome}</span>
      </div>

      {/* cabeçalho do PDV */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: C.bg,
              border: `1px solid ${C.border}`, display: "grid", placeItems: "center" }}>
              <Store size={22} color={C.orange} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{pdv.nome}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                {pdv.local || "—"}
              </div>
              {pdv.responsavel && (
                <div style={{ color: C.muted, fontSize: 12.5, marginTop: 3 }}>
                  <span style={{ color: C.blue }}>●</span> {pdv.responsavel}
                  {pdv.contato ? ` · ${pdv.contato}` : ""}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <IconBtn onClick={onEdit} title="Editar PDV"><User size={14} /></IconBtn>
            <IconBtn onClick={onRemove} title="Remover PDV" danger><Trash2 size={14} /></IconBtn>
          </div>
        </div>

        {/* métricas rápidas */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 16,
          borderTop: `1px solid ${C.border}` }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.blue,
              fontVariantNumeric: "tabular-nums" }}>{totalUn}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>UNIDADES</div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.orange,
              fontVariantNumeric: "tabular-nums" }}>{linhas.length}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>MODELOS</div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div style={{ textAlign: "center", flex: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green,
              fontVariantNumeric: "tabular-nums" }}>{brl(totalVal)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>VALOR EM ESTOQUE</div>
          </div>
        </div>
      </Card>

      {/* lista de produtos em estoque */}
      <SectionTitle sub={`Quadros atualmente em consignação em ${pdv.nome}`}>
        Estoque atual
      </SectionTitle>

      {linhas.length === 0 ? (
        <Empty icon={Boxes} title="Nenhum quadro em estoque"
          hint="Envie quadros para este ponto de venda na aba Enviar." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {/* cabeçalho da tabela */}
          <div style={{ display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: 8, padding: "10px 16px",
            background: C.bg,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted,
            letterSpacing: 0.5, textTransform: "uppercase" }}>
            <span>Quadro</span>
            <span style={{ textAlign: "center", minWidth: 60 }}>Qtd</span>
            <span style={{ textAlign: "right", minWidth: 90 }}>Preço unit.</span>
            <span style={{ textAlign: "right", minWidth: 100 }}>Total</span>
          </div>

          {linhas.map(({ produto: pr, qtd }, i) => (
            <div key={pr.id}
              style={{ display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 8, padding: "14px 16px", alignItems: "center",
                borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{pr.nome}</div>
                {pr.modelo && (
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{pr.modelo}</div>
                )}
              </div>
              <div style={{ textAlign: "center", minWidth: 60 }}>
                <span style={{ background: C.surface2, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "3px 10px", fontWeight: 700,
                  fontSize: 14, color: C.blue, fontVariantNumeric: "tabular-nums" }}>
                  {qtd}
                </span>
              </div>
              <div style={{ textAlign: "right", minWidth: 90, color: C.muted, fontSize: 13,
                fontVariantNumeric: "tabular-nums" }}>
                {brl(pr.preco)}
              </div>
              <div style={{ textAlign: "right", minWidth: 100, fontWeight: 700,
                color: C.orange, fontVariantNumeric: "tabular-nums" }}>
                {brl(qtd * (pr.preco || 0))}
              </div>
            </div>
          ))}

          {/* rodapé total */}
          <div style={{ display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: 8, padding: "12px 16px",
            borderTop: `2px solid ${C.border}`,
            background: C.bg }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.muted }}>TOTAL</div>
            <div style={{ textAlign: "center", minWidth: 60, fontWeight: 800,
              color: C.blue, fontVariantNumeric: "tabular-nums" }}>{totalUn}</div>
            <div style={{ minWidth: 90 }} />
            <div style={{ textAlign: "right", minWidth: 100, fontWeight: 800,
              color: C.green, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
              {brl(totalVal)}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// ============================================================
//  PONTOS DE VENDA
// ============================================================
function PdvView({ pdvs, onSave, onRemove, estoqueDe }) {
  const [form, setForm] = useState(null);
  const [selectedPdv, setSelectedPdv] = useState(null);
  const blank = { nome: "", local: "", responsavel: "", contato: "" };

  // Se tiver PDV selecionado, mostra o detalhe
  if (selectedPdv) {
    // garante dados frescos caso o pdv tenha sido editado
    const pdvAtual = pdvs.find((p) => p.id === selectedPdv.id) || selectedPdv;
    return (
      <>
        {form && (
          <Modal title="Editar ponto de venda" onClose={() => setForm(null)}>
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
        <PdvDetalhe
          pdv={pdvAtual}
          estoqueDe={estoqueDe}
          onBack={() => setSelectedPdv(null)}
          onEdit={() => setForm(pdvAtual)}
          onRemove={async () => { await onRemove(pdvAtual.id); setSelectedPdv(null); }}
        />
      </>
    );
  }

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
                <Card key={p.id} style={{ transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = C.orange}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>
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
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", fontSize: 13 }}>
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
                      letterSpacing: "0.05em", cursor: "pointer",
                      transition: "opacity 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                    GERENCIAR ESTOQUE
                  </button>
                </Card>
              );
            })}
          </div>
        )
      }
    </>
  );
}

// ============================================================
//  CATÁLOGO
// ============================================================
function CatalogoView({ produtos, onSave, onRemove }) {
  const [form, setForm] = useState(null);
  const blank = { nome: "", modelo: "", preco: "" };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start" }}>
        <SectionTitle sub="Os quadros que você produz e despacha para os PDVs.">
          Catálogo
        </SectionTitle>
        <Btn onClick={() => setForm(blank)}><Plus size={16} />Novo quadro</Btn>
      </div>

      {form && (
        <Modal title={form.id ? "Editar quadro" : "Novo quadro"}
          onClose={() => setForm(null)}>
          <Field label="Nome do quadro" req>
            <Input value={form.nome} placeholder="McLaren Senna"
              onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Modelo / linha">
            <Input value={form.modelo} placeholder="LEGO Speed Champions"
              onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </Field>
          <Field label="Preço de venda (R$)" req>
            <Input type="number" value={form.preco} placeholder="1490"
              onChange={(e) => setForm({ ...form, preco: e.target.value })} />
          </Field>
          <Btn full disabled={!form.nome.trim() || !form.preco}
            onClick={async () => { await onSave(form); setForm(null); }}>
            Salvar
          </Btn>
        </Modal>
      )}

      {produtos.length === 0
        ? <Empty icon={Package} title="Catálogo vazio"
            hint="Cadastre os quadros com preço para usá-los nos envios e vendas."
            action={<Btn onClick={() => setForm(blank)}><Plus size={16} />Cadastrar</Btn>} />
        : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {produtos.map((p, i) => (
              <div key={p.id}
                style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "14px 16px",
                  borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8,
                    background: C.bg, display: "grid", placeItems: "center",
                    border: `1px solid ${C.border}` }}>
                    <Package size={16} color={C.blue} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nome}</div>
                    <div style={{ color: C.muted, fontSize: 12.5 }}>{p.modelo || "—"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontWeight: 700, color: C.orange,
                    fontVariantNumeric: "tabular-nums" }}>{brl(p.preco)}</span>
                  <IconBtn onClick={() => setForm(p)} title="Editar"><User size={14} /></IconBtn>
                  <IconBtn onClick={() => onRemove(p.id)} title="Remover" danger>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </Card>
        )
      }
    </>
  );
}

// ============================================================
//  ENVIAR
// ============================================================
function EnviarView({ pdvs, produtos, onAdd, setTab }) {
  const [pdvId,     setPdvId]     = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd,       setQtd]       = useState(1);
  const [data,      setData]      = useState(today());

  const ready = pdvs.length && produtos.length;
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
            {produtos.map((p) =>
              <option key={p.id} value={p.id}>{p.nome} ({brl(p.preco)})</option>)}
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
  const [produtoId, setProd]  = useState("");
  const [data,      setData]  = useState(today());
  const [cli,       setCli]   = useState(
    { nome: "", cpf: "", email: "", telefone: "", endereco: "" }
  );

  const disponiveis = pdvId ? estoqueDe(pdvId) : [];
  const prod = produtos.find((p) => p.id === produtoId);
  const cliValido = cli.nome.trim() && cli.cpf.replace(/\D/g, "").length === 11;

  const reset = () => {
    setStep(1); setProd(""); setData(today());
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
                onChange={(e) => { setPdvId(e.target.value); setProd(""); }}>
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
                        const sel = produtoId === produto.id;
                        return (
                          <button key={produto.id} onClick={() => setProd(produto.id)}
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
            <Btn full disabled={!pdvId || !produtoId} onClick={() => setStep(2)}>
              Continuar
            </Btn>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: C.muted }}>{prod?.nome}</span>
              <span style={{ fontWeight: 700, color: C.orange }}>{brl(prod?.preco)}</span>
            </div>

            <Field label="Nome completo do cliente" req>
              <Input value={cli.nome}
                onChange={(e) => setCli({ ...cli, nome: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="CPF" req>
                  <Input va