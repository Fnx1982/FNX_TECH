// ============================================================
// sugestoes.js — botão 💡 ao lado do sino (tela inicial).
//
// Qualquer pessoa: envia sugestão pro site e acompanha a situação
// (Em análise → Em andamento → Finalizada).
// Setor TI (e administradores): aba "Painel TI" pra ver todas e mudar
// a situação. Quando finaliza, quem sugeriu recebe aviso no sino.
// O TI recebe aviso no sino + e-mail a cada sugestão nova (Worker).
// ============================================================
(function () {
  const STATUS = {
    "em-analise":   { nome: "Em análise",   cor: "#B34700", fundo: "#FFF1E6" },
    "em-andamento": { nome: "Em andamento", cor: "#1D5FB4", fundo: "#E3EEFB" },
    "finalizada":   { nome: "Finalizada",   cor: "#1C7A43", fundo: "#E2F5EA" },
  };
  const AREAS = ["Geral", "Orçamento / Propostas", "Obras e Demandas", "Financeiro / Boletos", "Pontos", "Calendário", "Contatos", "Celular", "Outro"];

  // Só pra mostrar a aba — quem decide de verdade é o Worker
  function pareceTI() {
    const setor = (localStorage.getItem("userSetor") || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
    return setor === "TI" || setor === "SUPERVISOR TI" || setor === "DIRETORIA" || (localStorage.getItem("userType") || "").toLowerCase() === "ceo";
  }
  const esc = (t) => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t || ""));
  const dataBR = (ms) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const avisar = (msg, tipo) => (typeof mostrarToast === "function" ? mostrarToast(msg, tipo) : alert(msg));

  // ---------- estilos ----------
  const estilo = document.createElement("style");
  estilo.textContent = `
    #btnSugestoes { position:fixed; top:16px; right:70px; z-index:2000; width:44px; height:44px; border-radius:50%;
      background:#fff; border:1px solid #e8e8e8; box-shadow:0 2px 8px rgba(0,0,0,.12); font-size:20px; cursor:pointer; }
    #btnSugestoes .badge-sug { display:none; position:absolute; top:-4px; right:-4px; background:#FF6A00; color:#fff; font-size:10px;
      font-weight:700; border-radius:100px; min-width:16px; height:16px; line-height:16px; padding:0 4px; }
    #modalSugestoes { display:none; position:fixed; inset:0; z-index:4000; background:rgba(0,0,0,.45); align-items:flex-start;
      justify-content:center; padding:40px 12px; overflow-y:auto; font-family:'Montserrat',sans-serif; }
    #modalSugestoes.aberto { display:flex; }
    .caixa-sug { background:#fff; width:100%; max-width:600px; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,.25); overflow:hidden; }
    .topo-sug { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:#2b2b2b; color:#fff; }
    .topo-sug h2 { margin:0; font-size:17px; }
    .topo-sug button { background:none; border:none; color:#fff; font-size:26px; cursor:pointer; line-height:1; }
    .abas-sug { display:flex; gap:6px; padding:12px 18px 0; flex-wrap:wrap; }
    .abas-sug button { border:none; background:#f1f1f1; color:#444; padding:8px 14px; border-radius:20px; font-weight:600; font-size:13px; cursor:pointer; font-family:inherit; }
    .abas-sug button.ativa { background:#FF6A00; color:#fff; }
    .corpo-sug { padding:16px 18px 20px; }
    .corpo-sug label { display:flex; flex-direction:column; gap:5px; font-size:13px; font-weight:600; color:#333; margin-bottom:12px; }
    .corpo-sug input, .corpo-sug select, .corpo-sug textarea { padding:10px; border:1px solid #ccc; border-radius:6px; font-family:inherit; font-size:14px; font-weight:normal; }
    .corpo-sug textarea { min-height:110px; resize:vertical; }
    .btn-enviar-sug { width:100%; padding:12px; border:none; border-radius:24px; background:#FF6A00; color:#fff; font-weight:700; font-size:15px; cursor:pointer; font-family:inherit; }
    .btn-enviar-sug:disabled { opacity:.6; }
    .card-sug { position:relative; border:1px solid #eee; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
    .card-sug .x-sug { position:absolute; top:6px; right:6px; width:28px; height:28px; border:none; background:none; color:#aaa;
      font-size:20px; line-height:1; cursor:pointer; border-radius:50%; }
    .card-sug .x-sug:hover { background:#f3f3f3; color:#c0392b; }
    .card-sug.com-x h4 { padding-right:26px; }
    .tag-oculta-sug { display:inline-block; font-size:10.5px; color:#777; background:#eee; border-radius:10px; padding:1px 8px; margin-left:4px; }
    .card-sug h4 { margin:0 0 4px; font-size:14.5px; color:#222; }
    .meta-sug { font-size:11.5px; color:#888; margin-bottom:6px; }
    .desc-sug { font-size:13px; color:#444; white-space:pre-wrap; margin:6px 0; }
    .tag-status-sug { display:inline-block; font-size:11px; font-weight:700; border-radius:12px; padding:2px 10px; }
    .resposta-sug { background:#f7f7f7; border-radius:8px; padding:8px 10px; font-size:12.5px; color:#333; margin-top:8px; }
    .acoes-ti { display:grid; grid-template-columns:1fr; gap:8px; margin-top:10px; border-top:1px dashed #e3e3e3; padding-top:10px; }
    .acoes-ti select, .acoes-ti textarea { padding:8px; border:1px solid #ccc; border-radius:6px; font-family:inherit; font-size:13px; }
    .acoes-ti textarea { min-height:60px; }
    .acoes-ti button { padding:9px; border:none; border-radius:20px; background:#2b2b2b; color:#fff; font-weight:700; cursor:pointer; font-family:inherit; }
    .filtros-ti { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
    .filtros-ti button { border:1px solid #ddd; background:#fff; padding:5px 12px; border-radius:16px; font-size:12px; cursor:pointer; font-family:inherit; }
    .filtros-ti button.ativo { border-color:#FF6A00; color:#B34700; font-weight:700; }
    .vazio-sug { text-align:center; color:#999; font-size:13px; padding:24px 0; }
    @media (max-width: 768px), (hover: none) and (max-width: 1100px) {
      #btnSugestoes { top:10px; right:64px; }
      #modalSugestoes { padding:10px 6px; }
      body.menu-mobile-aberto #btnSugestoes { display:none; }
    }
  `;
  document.head.appendChild(estilo);

  // ---------- botão ----------
  const botao = document.createElement("button");
  botao.id = "btnSugestoes";
  botao.type = "button";
  botao.title = "Sugestões para o site";
  botao.setAttribute("aria-label", "Sugestões para o site");
  botao.innerHTML = '💡<span class="badge-sug" id="badgeSugestoes"></span>';
  document.body.appendChild(botao);

  // ---------- janela ----------
  const modal = document.createElement("div");
  modal.id = "modalSugestoes";
  modal.innerHTML = `
    <div class="caixa-sug" role="dialog" aria-label="Sugestões">
      <div class="topo-sug"><h2>💡 Sugestões para o site</h2><button type="button" id="fecharSugestoes" aria-label="Fechar">&times;</button></div>
      <div class="abas-sug">
        <button type="button" data-aba="nova">Enviar sugestão</button>
        <button type="button" data-aba="minhas">Minhas sugestões</button>
        ${pareceTI() ? '<button type="button" data-aba="ti">Painel TI</button>' : ""}
      </div>
      <div class="corpo-sug" id="corpoSugestoes"></div>
    </div>`;
  document.body.appendChild(modal);

  let abaAtual = "nova";
  let filtroTI = "abertas";

  function fechar() { modal.classList.remove("aberto"); }
  document.getElementById("fecharSugestoes").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  modal.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => mostrarAba(b.dataset.aba)));
  botao.addEventListener("click", () => abrir(pareceTI() && Number(document.getElementById("badgeSugestoes").textContent) > 0 ? "ti" : "nova"));

  function abrir(aba) {
    modal.classList.add("aberto");
    mostrarAba(aba || "nova");
  }
  window.abrirPainelSugestoes = abrir;

  function tagStatus(status) {
    const s = STATUS[status] || STATUS["em-analise"];
    return `<span class="tag-status-sug" style="color:${s.cor};background:${s.fundo}">${s.nome}</span>`;
  }

  function mostrarAba(aba) {
    abaAtual = aba;
    modal.querySelectorAll("[data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
    if (aba === "nova") return renderNova();
    if (aba === "minhas") return renderLista(false);
    if (aba === "ti") return renderLista(true);
  }

  function renderNova() {
    const corpo = document.getElementById("corpoSugestoes");
    corpo.innerHTML = `
      <label>Título
        <input type="text" id="sugTitulo" maxlength="150" placeholder="Ex.: Botão pra duplicar orçamento" />
      </label>
      <label>Parte do site
        <select id="sugArea">${AREAS.map((a) => `<option>${a}</option>`).join("")}</select>
      </label>
      <label>Descreva a sugestão
        <textarea id="sugDescricao" maxlength="4000" placeholder="O que poderia melhorar, e por quê?"></textarea>
      </label>
      <button type="button" class="btn-enviar-sug" id="btnEnviarSugestao">Enviar para o TI</button>`;
    document.getElementById("btnEnviarSugestao").addEventListener("click", enviar);
    document.getElementById("sugTitulo").focus();
  }

  async function enviar() {
    const titulo = document.getElementById("sugTitulo").value.trim();
    const descricao = document.getElementById("sugDescricao").value.trim();
    const area = document.getElementById("sugArea").value;
    if (!titulo || !descricao) { avisar("Preencha o título e a descrição.", "erro"); return; }
    const btn = document.getElementById("btnEnviarSugestao");
    btn.disabled = true; btn.textContent = "Enviando…";
    const r = await chamarWorker("sugestoes-salvar", { method: "POST", body: { titulo, descricao, area } });
    btn.disabled = false; btn.textContent = "Enviar para o TI";
    if (!r.ok) { avisar(r.erro || "Não foi possível enviar.", "erro"); return; }
    avisar("Sugestão enviada! O TI vai analisar e você acompanha por aqui.");
    mostrarAba("minhas");
  }

  async function renderLista(modoTI) {
    const corpo = document.getElementById("corpoSugestoes");
    corpo.innerHTML = '<div class="vazio-sug">Carregando…</div>';
    const r = await chamarWorker(modoTI ? "sugestoes-list&todas=1" : "sugestoes-list");
    if (!r.ok) { corpo.innerHTML = `<div class="vazio-sug">${esc(r.erro || "Não foi possível carregar.")}</div>`; return; }
    let lista = r.sugestoes || [];

    let filtrosHtml = "";
    if (modoTI) {
      const contagem = (f) => lista.filter((s) => f === "abertas" ? s.status !== "finalizada" : f === "todas" ? true : s.status === f).length;
      const filtros = [["abertas", "Abertas"], ["em-analise", "Em análise"], ["em-andamento", "Em andamento"], ["finalizada", "Finalizadas"], ["todas", "Todas"]];
      filtrosHtml = `<div class="filtros-ti">${filtros.map(([f, n]) => `<button type="button" data-filtro="${f}" class="${filtroTI === f ? "ativo" : ""}">${n} (${contagem(f)})</button>`).join("")}</div>`;
      lista = lista.filter((s) => filtroTI === "abertas" ? s.status !== "finalizada" : filtroTI === "todas" ? true : s.status === filtroTI);
    }

    if (!lista.length) {
      corpo.innerHTML = filtrosHtml + `<div class="vazio-sug">${modoTI ? "Nenhuma sugestão aqui." : "Nenhuma sugestão na sua lista."}</div>`;
    } else {
      corpo.innerHTML = filtrosHtml + lista.map((s) => `
        <div class="card-sug ${modoTI ? "" : "com-x"}">
          ${modoTI ? "" : `<button type="button" class="x-sug" data-ocultar-id="${s.id}" title="Tirar da minha lista (o TI continua com ela)" aria-label="Tirar da minha lista">&times;</button>`}
          <h4>${esc(s.titulo)}</h4>
          <div class="meta-sug">${tagStatus(s.status)} · ${esc(s.area || "Geral")} · ${dataBR(s.criadoEm)}${modoTI ? ` · por <b>${esc(s.autorNome)}</b>` : ""}${modoTI && s.ocultaParaAutor ? '<span class="tag-oculta-sug">tirada da lista de quem pediu</span>' : ""}</div>
          <div class="desc-sug">${esc(s.descricao)}</div>
          ${s.respostaTI ? `<div class="resposta-sug"><b>Resposta do TI:</b> ${esc(s.respostaTI)}</div>` : ""}
          ${modoTI ? `
            <div class="acoes-ti">
              <select data-status-id="${s.id}">
                ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === s.status ? "selected" : ""}>${v.nome}</option>`).join("")}
              </select>
              <textarea data-resposta-id="${s.id}" placeholder="Resposta para quem sugeriu (opcional — aparece pra ela)">${esc(s.respostaTI || "")}</textarea>
              <button type="button" data-salvar-id="${s.id}">Salvar situação</button>
            </div>` : ""}
        </div>`).join("");
    }

    corpo.querySelectorAll("[data-ocultar-id]").forEach((b) => b.addEventListener("click", async () => {
      const card = b.closest(".card-sug");
      const titulo = card ? card.querySelector("h4").textContent : "";
      const pergunta = "Tirar \"" + titulo + "\" da sua lista?";
      const detalhe = "Ela some só pra você. O TI continua com ela e, se for finalizada, você ainda recebe o aviso no sino.";
      const ok = typeof confirmarAcao === "function" ? await confirmarAcao(pergunta, detalhe) : confirm(pergunta + "\n\n" + detalhe);
      if (!ok) return;
      b.disabled = true;
      const resp = await chamarWorker("sugestoes-ocultar", { method: "POST", body: { id: b.dataset.ocultarId } });
      if (!resp.ok) { avisar(resp.erro || "Não foi possível tirar da lista.", "erro"); b.disabled = false; return; }
      avisar("Tirada da sua lista.");
      renderLista(false);
    }));
    corpo.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { filtroTI = b.dataset.filtro; renderLista(true); }));
    corpo.querySelectorAll("[data-salvar-id]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.salvarId;
      const status = corpo.querySelector(`[data-status-id="${id}"]`).value;
      const respostaTI = corpo.querySelector(`[data-resposta-id="${id}"]`).value;
      b.disabled = true; b.textContent = "Salvando…";
      const resp = await chamarWorker("sugestoes-status", { method: "POST", body: { id, status, respostaTI } });
      if (!resp.ok) { avisar(resp.erro || "Não foi possível salvar.", "erro"); b.disabled = false; b.textContent = "Salvar situação"; return; }
      avisar(status === "finalizada" ? "Finalizada — quem sugeriu foi avisado." : "Situação atualizada.");
      atualizarBadge();
      renderLista(true);
    }));
  }

  // Bolinha no 💡 (só pro TI): quantas sugestões ainda estão "Em análise"
  async function atualizarBadge() {
    if (!pareceTI()) return;
    const r = await chamarWorker("sugestoes-list&todas=1");
    const badge = document.getElementById("badgeSugestoes");
    const n = r.ok ? (r.sugestoes || []).filter((s) => s.status === "em-analise").length : 0;
    badge.textContent = n;
    badge.style.display = n ? "inline-block" : "none";
  }
  atualizarBadge();

  // Vindo de uma notificação de outra página: home.html?sugestoes=minhas|ti
  const pedido = new URLSearchParams(location.search).get("sugestoes");
  if (pedido) abrir(pedido === "ti" && pareceTI() ? "ti" : "minhas");
})();
