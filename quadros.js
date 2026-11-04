// ============================================================
// quadros.js — Quadros estilo Trello (FNX TECH)
//
// Quadros → listas → cartões. Cada cartão tem etiquetas, prazo,
// responsáveis, checklist, comentários e cor de capa. Os cartões
// são arrastáveis entre listas (mouse: arrasta direto; celular:
// segure o dedo ~0,3s no cartão e arraste). No cartão também dá
// pra trocar de lista pelo seletor "na lista", útil no celular.
//
// Tudo fica no Worker (ações "trello-*"); a tela recarrega o quadro
// sozinha a cada 20s para mostrar o que outras pessoas mudaram.
// ============================================================

(function () {
  const CORES = ["#FF6A00", "#E5141B", "#111111", "#FFB000", "#1C8A4B", "#2B6CB0", "#7B3FE4", "#D63384", "#0EA5A4", "#8A8A8A"];
  const INTERVALO_ATUALIZAR = 20000;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t ?? ""));
  const toast = (m, tipo) => (typeof mostrarToast === "function" ? mostrarToast(m, tipo) : alert(m));
  const meuRegistro = () => String(localStorage.getItem("userId") || "");
  const meuNome = () => localStorage.getItem("userNome") || "";

  let quadros = [];
  let quadro = null;      // quadro aberto (com listas e etiquetas)
  let cartoes = [];       // cartões do quadro aberto
  let usuarios = [];      // [{registro, nome, setor}]
  let cartaoAberto = null; // cópia em edição no modal
  let arrastando = false;
  let timerAtualizar = null;

  // ── Utilidades ──────────────────────────────────────────────
  function iniciais(nome) {
    const p = String(nome || "?").trim().split(/\s+/);
    return ((p[0] || "")[0] || "?").toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : "") || "").toUpperCase();
  }
  function nomeUsuario(reg) {
    const u = usuarios.find((x) => String(x.registro) === String(reg));
    return u ? u.nome : `Registro ${reg}`;
  }
  function corAvatar(reg) {
    const s = String(reg);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ["#111111", "#FF6A00", "#E5141B", "#D45500", "#2B6CB0", "#1C8A4B", "#7B3FE4"][h % 7];
  }
  function avatarHtml(reg) {
    return `<span class="avatar" style="background:${corAvatar(reg)}" title="${esc(nomeUsuario(reg))}">${esc(iniciais(nomeUsuario(reg)))}</span>`;
  }
  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dataCurta(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}${a !== String(new Date().getFullYear()) ? "/" + a : ""}`;
  }
  function dataHora(iso) {
    try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function etiqueta(id) { return (quadro && quadro.etiquetas || []).find((e) => e.id === id); }
  function cartoesDaLista(listaId) {
    return cartoes.filter((c) => c.listaId === listaId).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  async function api(action, body) {
    try {
      return await chamarWorker(action, body ? { method: "POST", body } : {});
    } catch (e) {
      return { ok: false, erro: "Sem conexão com o servidor." };
    }
  }

  // ============================================================
  // LISTA DE QUADROS
  // ============================================================
  async function carregarQuadros() {
    const r = await api("trello-quadros-list");
    const grade = $("gradeQuadros");
    if (!r.ok) { grade.innerHTML = `<div class="vazio">${esc(r.erro || "Não foi possível carregar os boards.")}</div>`; return; }
    quadros = r.quadros || [];
    renderGradeQuadros();
  }

  function renderGradeQuadros() {
    const grade = $("gradeQuadros");
    grade.innerHTML = "";
    quadros
      .slice()
      .sort((a, b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || "")))
      .forEach((q) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "card-quadro";
        b.style.background = `linear-gradient(135deg, ${q.cor || CORES[0]} 0%, ${q.cor || CORES[0]}CC 55%, #111 160%)`;
        b.innerHTML = `<span class="nome">${esc(q.nome)}</span>
          <span class="info"><span><i class="bx bx-list-ul"></i> ${(q.listas || []).length} listas</span><span><i class="bx bx-card"></i> ${q.totalCartoes || 0} cartões</span></span>`;
        b.addEventListener("click", () => abrirQuadro(q.id));
        grade.appendChild(b);
      });
    const novo = document.createElement("button");
    novo.type = "button";
    novo.className = "card-quadro-novo";
    novo.innerHTML = `<i class="bx bx-plus"></i> Criar board`;
    novo.addEventListener("click", () => abrirModalQuadro(null));
    grade.appendChild(novo);
  }

  // ============================================================
  // QUADRO ABERTO
  // ============================================================
  async function abrirQuadro(id, { silencioso = false } = {}) {
    const r = await api(`trello-quadro-get&id=${encodeURIComponent(id)}`);
    if (!r.ok) {
      if (!silencioso) toast(r.erro || "Não foi possível abrir o board.", "erro");
      if (!quadro) mostrarLista();
      return false;
    }
    quadro = r.quadro;
    cartoes = r.cartoes || [];
    const url = new URL(location.href);
    if (url.searchParams.get("quadro") !== id) {
      url.searchParams.set("quadro", id);
      url.searchParams.delete("cartao");
      history.pushState({ quadro: id }, "", url);
    }
    $("telaQuadros").hidden = true;
    $("telaQuadro").hidden = false;
    $("telaQuadro").style.setProperty("--cor-quadro", quadro.cor || CORES[0]);
    $("nomeQuadro").textContent = quadro.nome;
    document.title = `${quadro.nome} — Boards — FNX TECH`;
    preencherFiltros();
    renderListas();
    agendarAtualizacao();
    return true;
  }

  function mostrarLista() {
    quadro = null;
    cartoes = [];
    clearTimeout(timerAtualizar);
    $("telaQuadro").hidden = true;
    $("telaQuadros").hidden = false;
    document.title = "Boards — FNX TECH";
    carregarQuadros();
  }

  function agendarAtualizacao() {
    clearTimeout(timerAtualizar);
    timerAtualizar = setTimeout(async () => {
      const ocupado = arrastando || $("modalCartao").classList.contains("active") || document.querySelector(".form-novo, [contenteditable=true], .menu-lista");
      if (quadro && !ocupado && !document.hidden) {
        const r = await api(`trello-quadro-get&id=${encodeURIComponent(quadro.id)}`);
        if (r.ok && quadro && r.quadro.id === quadro.id && !arrastando) {
          const mudou = JSON.stringify(r.cartoes) !== JSON.stringify(cartoes) || JSON.stringify(r.quadro) !== JSON.stringify(quadro);
          quadro = r.quadro;
          cartoes = r.cartoes || [];
          if (mudou) { $("nomeQuadro").textContent = quadro.nome; preencherFiltros(); renderListas(); }
        }
      }
      if (quadro) agendarAtualizacao();
    }, INTERVALO_ATUALIZAR);
  }

  // ── Filtros ────────────────────────────────────────────────
  function preencherFiltros() {
    const fe = $("filtroEtiqueta");
    const valE = fe.value;
    fe.innerHTML = `<option value="">Todas as etiquetas</option>` +
      (quadro.etiquetas || []).map((e) => `<option value="${esc(e.id)}">${esc(e.nome || "Sem nome")}</option>`).join("");
    fe.value = [...fe.options].some((o) => o.value === valE) ? valE : "";
    const fr = $("filtroResponsavel");
    const valR = fr.value;
    fr.innerHTML = `<option value="">Todos</option><option value="__meus">Meus cartões</option>` +
      usuarios.map((u) => `<option value="${esc(u.registro)}">${esc(u.nome)}</option>`).join("");
    fr.value = [...fr.options].some((o) => o.value === valR) ? valR : "";
  }
  function passaFiltro(c) {
    const busca = $("buscaCartoes").value.trim().toLowerCase();
    const etq = $("filtroEtiqueta").value;
    let resp = $("filtroResponsavel").value;
    if (resp === "__meus") resp = meuRegistro();
    if (busca && !(`${c.titulo} ${c.descricao || ""}`.toLowerCase().includes(busca))) return false;
    if (etq && !(c.etiquetas || []).includes(etq)) return false;
    if (resp && !(c.responsaveis || []).map(String).includes(String(resp))) return false;
    return true;
  }
  ["buscaCartoes", "filtroEtiqueta", "filtroResponsavel"].forEach((id) => $(id).addEventListener("input", () => renderListas()));

  // ── Render ─────────────────────────────────────────────────
  function renderListas() {
    const area = $("areaListas");
    const rolagem = area.scrollLeft;
    area.innerHTML = "";
    (quadro.listas || []).forEach((lista, idx) => area.appendChild(montarLista(lista, idx)));
    area.appendChild(montarNovaLista());
    area.scrollLeft = rolagem;
  }

  function montarLista(lista, idx) {
    const el = document.createElement("div");
    el.className = "lista";
    el.dataset.listaId = lista.id;
    const todos = cartoesDaLista(lista.id);
    const visiveis = todos.filter(passaFiltro);
    el.innerHTML = `
      <div class="lista-cabecalho">
        <div class="lista-nome" title="Clique para renomear">${esc(lista.nome)}</div>
        <span class="lista-contagem">${visiveis.length === todos.length ? todos.length : `${visiveis.length}/${todos.length}`}</span>
        <button type="button" class="btn-menu-lista" aria-label="Ações da lista"><i class="bx bx-dots-horizontal-rounded"></i></button>
      </div>
      <div class="cartoes" data-lista-id="${esc(lista.id)}"></div>
      <div class="lista-rodape"><button type="button" class="btn-add-cartao"><i class="bx bx-plus"></i> Adicionar cartão</button></div>`;
    const cont = el.querySelector(".cartoes");
    visiveis.forEach((c) => cont.appendChild(montarCartao(c)));

    const nomeEl = el.querySelector(".lista-nome");
    nomeEl.addEventListener("click", () => editarTextoInline(nomeEl, lista.nome, async (novo) => {
      const r = await api("trello-lista-salvar", { quadroId: quadro.id, id: lista.id, nome: novo });
      if (!r.ok) { toast(r.erro || "Não foi possível renomear.", "erro"); return; }
      quadro = r.quadro; renderListas();
    }));
    el.querySelector(".btn-menu-lista").addEventListener("click", (e) => abrirMenuLista(e.currentTarget, lista, idx));
    el.querySelector(".btn-add-cartao").addEventListener("click", () => abrirFormNovoCartao(el, lista));
    return el;
  }

  function montarCartao(c) {
    const el = document.createElement("div");
    el.className = "cartao" + (c.concluido ? " concluido" : "");
    el.tabIndex = 0;
    el.dataset.cartaoId = c.id;
    const etqs = (c.etiquetas || []).map(etiqueta).filter(Boolean);
    const check = c.checklist || [];
    const feitos = check.filter((i) => i.feito).length;
    let seloPrazo = "";
    if (c.prazo) {
      const hoje = hojeISO();
      const classe = c.concluido ? "prazo-ok-feito" : c.prazo < hoje ? "prazo-vencido" : c.prazo === hoje ? "prazo-hoje" : "";
      seloPrazo = `<span class="selo ${classe}" title="Prazo"><i class="bx bx-time-five"></i>${dataCurta(c.prazo)}</span>`;
    }
    el.innerHTML = `
      ${c.capa ? `<div class="capa" style="background:${esc(c.capa)}"></div>` : ""}
      ${etqs.length ? `<div class="etiquetas">${etqs.map((e) => `<span class="etq" style="background:${esc(e.cor)}" title="${esc(e.nome)}"></span>`).join("")}</div>` : ""}
      <div class="titulo">${esc(c.titulo)}</div>
      <div class="selos">${[
        seloPrazo,
        c.descricao ? `<span class="selo" title="Tem descrição"><i class="bx bx-align-left"></i></span>` : "",
        (c.comentarios || []).length ? `<span class="selo" title="Comentários"><i class="bx bx-message-rounded"></i>${c.comentarios.length}</span>` : "",
        check.length ? `<span class="selo ${feitos === check.length ? "checklist-completo" : ""}" title="Checklist"><i class="bx bx-check-square"></i>${feitos}/${check.length}</span>` : "",
        (c.responsaveis || []).length ? `<span class="avatares">${c.responsaveis.slice(0, 4).map(avatarHtml).join("")}</span>` : "",
      ].join("")}</div>`;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") abrirCartao(c.id); });
    ligarArrastar(el, c);
    return el;
  }

  function montarNovaLista() {
    const el = document.createElement("div");
    el.className = "nova-lista";
    el.innerHTML = `<button type="button" class="btn-nova-lista"><i class="bx bx-plus"></i> Adicionar outra lista</button>`;
    el.querySelector("button").addEventListener("click", () => {
      el.innerHTML = `<form class="form-novo"><input type="text" maxlength="60" placeholder="Nome da lista" required />
        <div class="form-novo-acoes"><button type="submit" class="btn-laranja">Adicionar lista</button><button type="button" class="btn-x" aria-label="Cancelar">&times;</button></div></form>`;
      const form = el.querySelector("form");
      const input = form.querySelector("input");
      input.focus();
      form.querySelector(".btn-x").addEventListener("click", () => renderListas());
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nome = input.value.trim();
        if (!nome) return;
        input.disabled = true;
        const r = await api("trello-lista-salvar", { quadroId: quadro.id, nome });
        if (!r.ok) { toast(r.erro || "Não foi possível criar a lista.", "erro"); input.disabled = false; return; }
        quadro = r.quadro;
        renderListas();
        $("areaListas").scrollLeft = $("areaListas").scrollWidth;
        const btn = $("areaListas").querySelector(".btn-nova-lista");
        if (btn) btn.click(); // já deixa pronto pra outra lista
      });
    });
    return el;
  }

  function editarTextoInline(el, valorAtual, aoSalvar) {
    if (el.isContentEditable) return;
    el.contentEditable = "true";
    el.focus();
    document.getSelection().selectAllChildren(el);
    let terminou = false;
    const terminar = async (salvar) => {
      if (terminou) return;
      terminou = true;
      el.contentEditable = "false";
      const novo = el.textContent.trim();
      if (salvar && novo && novo !== valorAtual) await aoSalvar(novo);
      else el.textContent = valorAtual;
    };
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); terminar(true); }
      if (e.key === "Escape") { e.preventDefault(); terminar(false); }
    });
    el.addEventListener("blur", () => terminar(true), { once: true });
  }

  // ── Menu da lista ──────────────────────────────────────────
  function fecharMenus() { document.querySelectorAll(".menu-lista").forEach((m) => m.remove()); }
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu-lista, .btn-menu-lista")) fecharMenus(); });

  function abrirMenuLista(botao, lista, idx) {
    fecharMenus();
    const menu = document.createElement("div");
    menu.className = "menu-lista";
    const total = (quadro.listas || []).length;
    menu.innerHTML = `
      <button type="button" data-acao="renomear"><i class="bx bx-edit"></i> Renomear lista</button>
      <button type="button" data-acao="cartao"><i class="bx bx-plus"></i> Adicionar cartão</button>
      ${idx > 0 ? `<button type="button" data-acao="esq"><i class="bx bx-left-arrow-alt"></i> Mover para a esquerda</button>` : ""}
      ${idx < total - 1 ? `<button type="button" data-acao="dir"><i class="bx bx-right-arrow-alt"></i> Mover para a direita</button>` : ""}
      <button type="button" data-acao="excluir" class="perigo"><i class="bx bx-trash"></i> Excluir lista</button>`;
    document.body.appendChild(menu);
    const r = botao.getBoundingClientRect();
    menu.style.top = `${r.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + window.scrollX}px`;
    menu.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      fecharMenus();
      const listaEl = document.querySelector(`.lista[data-lista-id="${CSS.escape(lista.id)}"]`);
      if (b.dataset.acao === "renomear" && listaEl) listaEl.querySelector(".lista-nome").click();
      if (b.dataset.acao === "cartao" && listaEl) abrirFormNovoCartao(listaEl, lista);
      if (b.dataset.acao === "esq" || b.dataset.acao === "dir") {
        const ordem = quadro.listas.map((l) => l.id);
        const novoIdx = idx + (b.dataset.acao === "esq" ? -1 : 1);
        [ordem[idx], ordem[novoIdx]] = [ordem[novoIdx], ordem[idx]];
        const resp = await api("trello-listas-ordenar", { quadroId: quadro.id, ordem });
        if (!resp.ok) { toast(resp.erro || "Não foi possível mover.", "erro"); return; }
        quadro = resp.quadro; renderListas();
      }
      if (b.dataset.acao === "excluir") {
        const n = cartoesDaLista(lista.id).length;
        const ok = await confirmarAcao(`Excluir a lista "${lista.nome}"?`, n ? `Os ${n} cartão(ões) dela também serão apagados. Não dá para desfazer.` : "Não dá para desfazer.");
        if (!ok) return;
        const resp = await api("trello-lista-excluir", { quadroId: quadro.id, id: lista.id });
        if (!resp.ok) { toast(resp.erro || "Não foi possível excluir.", "erro"); return; }
        quadro = resp.quadro;
        cartoes = cartoes.filter((c) => c.listaId !== lista.id);
        renderListas();
      }
    });
  }

  // ── Novo cartão (inline) ───────────────────────────────────
  function abrirFormNovoCartao(listaEl, lista) {
    const rodape = listaEl.querySelector(".lista-rodape");
    rodape.innerHTML = `<form class="form-novo"><textarea rows="3" maxlength="200" placeholder="Insira um título para este cartão…"></textarea>
      <div class="form-novo-acoes"><button type="submit" class="btn-laranja">Adicionar cartão</button><button type="button" class="btn-x" aria-label="Cancelar">&times;</button></div></form>`;
    const form = rodape.querySelector("form");
    const ta = form.querySelector("textarea");
    ta.focus();
    listaEl.querySelector(".cartoes").scrollTop = 1e6;
    const cancelar = () => {
      rodape.innerHTML = `<button type="button" class="btn-add-cartao"><i class="bx bx-plus"></i> Adicionar cartão</button>`;
      rodape.querySelector("button").addEventListener("click", () => abrirFormNovoCartao(listaEl, lista));
    };
    form.querySelector(".btn-x").addEventListener("click", cancelar);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
      if (e.key === "Escape") cancelar();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = ta.value.trim();
      if (!titulo) return;
      ta.disabled = true;
      const daLista = cartoesDaLista(lista.id);
      const ordem = daLista.length ? (daLista[daLista.length - 1].ordem || 0) + 1024 : 1024;
      const r = await api("trello-cartao-salvar", { quadroId: quadro.id, cartao: { listaId: lista.id, titulo, ordem } });
      if (!r.ok) { toast(r.erro || "Não foi possível criar o cartão.", "erro"); ta.disabled = false; return; }
      cartoes.push(r.cartao);
      const cont = listaEl.querySelector(".cartoes");
      cont.appendChild(montarCartao(r.cartao));
      listaEl.querySelector(".lista-contagem").textContent = cartoesDaLista(lista.id).length;
      ta.disabled = false;
      ta.value = "";
      ta.focus();
      cont.scrollTop = 1e6;
    });
  }

  // ============================================================
  // ARRASTAR CARTÕES (mouse e toque)
  // ============================================================
  function ligarArrastar(el, c) {
    let inicio = null, timerToque = null, fantasma = null, marcador = null, alvo = null, desloc = null;

    const limpar = () => {
      clearTimeout(timerToque);
      document.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerup", aoSoltar);
      document.removeEventListener("pointercancel", aoCancelar);
    };
    const comecar = (e) => {
      arrastando = true;
      const r = el.getBoundingClientRect();
      desloc = { x: e.clientX - r.left, y: e.clientY - r.top };
      fantasma = el.cloneNode(true);
      fantasma.classList.add("cartao-fantasma");
      fantasma.style.width = r.width + "px";
      document.body.appendChild(fantasma);
      el.classList.add("arrastando-origem");
      marcador = document.createElement("div");
      marcador.className = "marcador-soltar";
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* ok */ }
      posicionar(e);
    };
    const posicionar = (e) => {
      fantasma.style.left = e.clientX - desloc.x + "px";
      fantasma.style.top = e.clientY - desloc.y + "px";
      fantasma.style.display = "none";
      const sob = document.elementFromPoint(e.clientX, e.clientY);
      fantasma.style.display = "";
      const listaEl = sob && sob.closest(".lista");
      if (!listaEl) return;
      const cont = listaEl.querySelector(".cartoes");
      const irmaos = [...cont.querySelectorAll(".cartao:not(.arrastando-origem)")];
      const depois = irmaos.find((x) => { const b = x.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
      if (depois) cont.insertBefore(marcador, depois); else cont.appendChild(marcador);
      alvo = { listaId: listaEl.dataset.listaId, antesDe: depois ? depois.dataset.cartaoId : null };
      // rolagem automática perto das bordas
      const area = $("areaListas");
      const ra = area.getBoundingClientRect();
      if (e.clientX > ra.right - 50) area.scrollLeft += 18;
      else if (e.clientX < ra.left + 50) area.scrollLeft -= 18;
      const rc = cont.getBoundingClientRect();
      if (e.clientY > rc.bottom - 30) cont.scrollTop += 12;
      else if (e.clientY < rc.top + 30) cont.scrollTop -= 12;
    };
    const aoMover = (e) => {
      if (fantasma) { e.preventDefault(); posicionar(e); return; }
      if (!inicio) return;
      const dist = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
      if (inicio.toque) { if (dist > 10) { limpar(); inicio = null; } return; } // rolou a tela: não é arrasto
      if (dist > 6) comecar(e);
    };
    const finalizarVisual = () => {
      if (fantasma) fantasma.remove();
      if (marcador) marcador.remove();
      el.classList.remove("arrastando-origem");
      fantasma = marcador = null;
      setTimeout(() => { arrastando = false; }, 0);
    };
    const aoSoltar = async () => {
      limpar();
      const estava = !!fantasma;
      finalizarVisual();
      inicio = null;
      if (!estava) { abrirCartao(c.id); return; }
      if (alvo) await moverCartao(c.id, alvo.listaId, alvo.antesDe);
      alvo = null;
    };
    const aoCancelar = () => { limpar(); finalizarVisual(); inicio = null; alvo = null; };

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      inicio = { x: e.clientX, y: e.clientY, toque: e.pointerType !== "mouse" };
      document.addEventListener("pointermove", aoMover, { passive: false });
      document.addEventListener("pointerup", aoSoltar);
      document.addEventListener("pointercancel", aoCancelar);
      if (inicio.toque) timerToque = setTimeout(() => { if (inicio) comecar(e); }, 320);
    });
    // Bloqueia a rolagem da tela enquanto arrasta com o dedo
    el.addEventListener("touchmove", (e) => { if (fantasma) e.preventDefault(); }, { passive: false });
    el.addEventListener("contextmenu", (e) => { if (inicio && inicio.toque) e.preventDefault(); });
  }

  function calcularOrdem(listaId, antesDeId, ignorarId) {
    const lista = cartoesDaLista(listaId).filter((x) => x.id !== ignorarId);
    if (!lista.length) return 1024;
    if (!antesDeId) return (lista[lista.length - 1].ordem || 0) + 1024;
    const i = lista.findIndex((x) => x.id === antesDeId);
    if (i <= 0) return (lista[0].ordem || 0) - 1024;
    return ((lista[i - 1].ordem || 0) + (lista[i].ordem || 0)) / 2;
  }

  async function moverCartao(id, listaId, antesDeId) {
    const c = cartoes.find((x) => x.id === id);
    if (!c) return;
    if (antesDeId === id) return;
    const ordem = calcularOrdem(listaId, antesDeId, id);
    const anterior = { listaId: c.listaId, ordem: c.ordem };
    if (anterior.listaId === listaId && anterior.ordem === ordem) return;
    c.listaId = listaId;
    c.ordem = ordem;
    renderListas(); // otimista
    const r = await api("trello-cartao-mover", { quadroId: quadro.id, id, listaId, ordem });
    if (!r.ok) {
      Object.assign(c, anterior);
      renderListas();
      toast(r.erro || "Não foi possível mover o cartão.", "erro");
      return;
    }
    Object.assign(c, r.cartao);
  }

  // ============================================================
  // MODAL DO CARTÃO
  // ============================================================
  function abrirCartao(id) {
    const c = cartoes.find((x) => x.id === id);
    if (!c) return;
    cartaoAberto = JSON.parse(JSON.stringify(c));
    const url = new URL(location.href);
    url.searchParams.set("cartao", id);
    history.replaceState(history.state, "", url);
    renderModalCartao();
    $("modalCartao").classList.add("active");
    document.body.style.overflow = "hidden";
    ajustarAlturaTitulo();
  }

  function fecharCartao() {
    $("modalCartao").classList.remove("active");
    document.body.style.overflow = "";
    cartaoAberto = null;
    const url = new URL(location.href);
    url.searchParams.delete("cartao");
    history.replaceState(history.state, "", url);
  }

  function ajustarAlturaTitulo() {
    const t = $("tituloCartao");
    t.style.height = "auto";
    t.style.height = t.scrollHeight + "px";
  }

  function renderModalCartao() {
    const c = cartaoAberto;
    $("tituloCartao").value = c.titulo;
    $("descricaoCartao").value = c.descricao || "";
    $("prazoCartao").value = c.prazo || "";
    $("concluidoCartao").checked = !!c.concluido;
    $("cartaoLista").innerHTML = quadro.listas.map((l) => `<option value="${esc(l.id)}" ${l.id === c.listaId ? "selected" : ""}>${esc(l.nome)}</option>`).join("");

    // responsáveis
    $("escolhaResponsaveis").innerHTML = usuarios.length
      ? usuarios.map((u) => `<label class="escolha"><input type="checkbox" value="${esc(u.registro)}" ${(c.responsaveis || []).map(String).includes(String(u.registro)) ? "checked" : ""} />${avatarHtml(u.registro)}<span>${esc(u.nome)}</span></label>`).join("")
      : `<span class="escolha-vazia">Nenhum usuário encontrado.</span>`;
    // etiquetas
    $("escolhaEtiquetas").innerHTML = (quadro.etiquetas || []).length
      ? quadro.etiquetas.map((e) => `<label class="escolha"><input type="checkbox" value="${esc(e.id)}" ${(c.etiquetas || []).includes(e.id) ? "checked" : ""} /><span class="amostra" style="background:${esc(e.cor)}"></span><span>${esc(e.nome || "Sem nome")}</span></label>`).join("")
      : `<span class="escolha-vazia">Crie etiquetas na engrenagem do board.</span>`;
    // capa
    $("coresCapa").innerHTML = `<button type="button" class="sem-cor ${!c.capa ? "ativo" : ""}" data-cor="" title="Sem capa">✕</button>` +
      CORES.map((cor) => `<button type="button" data-cor="${cor}" class="${c.capa === cor ? "ativo" : ""}" style="background:${cor}" title="${cor}"></button>`).join("");

    renderMetaCartao();
    renderChecklist();
    renderComentarios();
    const criador = c.criadoPorNome || (c.criadoPor ? nomeUsuario(c.criadoPor) : "");
    $("cartaoAutoria").innerHTML = [criador && `Criado por <b>${esc(criador)}</b>`, c.criadoEm && dataHora(c.criadoEm), c.atualizadoEm && `atualizado ${dataHora(c.atualizadoEm)}`].filter(Boolean).join(" · ");
  }

  function renderMetaCartao() {
    const c = cartaoAberto;
    const blocos = [];
    if ((c.responsaveis || []).length) blocos.push(`<div class="meta-bloco"><h5>Responsáveis</h5><div class="pilulas">${c.responsaveis.map(avatarHtml).join("")}</div></div>`);
    const etqs = (c.etiquetas || []).map(etiqueta).filter(Boolean);
    if (etqs.length) blocos.push(`<div class="meta-bloco"><h5>Etiquetas</h5><div class="pilulas">${etqs.map((e) => `<span class="pilula" style="background:${esc(e.cor)}">${esc(e.nome || "")}</span>`).join("")}</div></div>`);
    if (c.prazo) {
      const hoje = hojeISO();
      const status = c.concluido ? ["#1C8A4B", "concluído"] : c.prazo < hoje ? ["#E5141B", "atrasado"] : c.prazo === hoje ? ["#FFB000", "vence hoje"] : ["#5e6c84", ""];
      blocos.push(`<div class="meta-bloco"><h5>Prazo</h5><div class="pilulas"><span class="pilula" style="background:${status[0]}">${dataCurta(c.prazo)}${status[1] ? " · " + status[1] : ""}</span></div></div>`);
    }
    $("cartaoMeta").innerHTML = blocos.join("");
  }

  function renderChecklist() {
    const itens = cartaoAberto.checklist || [];
    const feitos = itens.filter((i) => i.feito).length;
    const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
    $("progressoChecklistTexto").textContent = itens.length ? `${pct}% (${feitos}/${itens.length})` : "";
    $("barraProgressoChecklist").style.width = pct + "%";
    $("barraProgressoChecklist").parentElement.classList.toggle("completa", itens.length > 0 && feitos === itens.length);
    $("checklistCartao").innerHTML = itens.map((i) => `
      <li class="${i.feito ? "feito" : ""}" data-id="${esc(i.id)}">
        <input type="checkbox" ${i.feito ? "checked" : ""} aria-label="Marcar item" />
        <span class="texto-item">${esc(i.texto)}</span>
        <button type="button" class="btn-x" aria-label="Remover item">&times;</button>
      </li>`).join("");
  }

  function renderComentarios() {
    const lista = (cartaoAberto.comentarios || []).slice().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    $("comentariosCartao").innerHTML = lista.map((m) => `
      <li data-id="${esc(m.id)}">
        ${avatarHtml(m.autor)}
        <div class="comentario-corpo">
          <div class="comentario-topo"><b>${esc(m.autorNome || nomeUsuario(m.autor))}</b>${dataHora(m.criadoEm)}
            ${String(m.autor) === meuRegistro() ? `<button type="button" class="comentario-excluir">Excluir</button>` : ""}</div>
          <div class="comentario-texto">${esc(m.texto)}</div>
        </div>
      </li>`).join("");
  }

  // Lê os campos do modal para o cartão em edição
  function lerCamposModal() {
    const c = cartaoAberto;
    c.titulo = $("tituloCartao").value.trim() || c.titulo;
    c.descricao = $("descricaoCartao").value;
    c.prazo = $("prazoCartao").value || "";
    c.concluido = $("concluidoCartao").checked;
    c.responsaveis = [...$("escolhaResponsaveis").querySelectorAll("input:checked")].map((i) => i.value);
    c.etiquetas = [...$("escolhaEtiquetas").querySelectorAll("input:checked")].map((i) => i.value);
  }

  async function salvarCartaoAberto({ fechar = false, silencioso = false } = {}) {
    if (!cartaoAberto) return true;
    lerCamposModal();
    const original = cartoes.find((x) => x.id === cartaoAberto.id);
    const campos = ["titulo", "descricao", "prazo", "concluido", "responsaveis", "etiquetas", "capa", "checklist"];
    const mudou = !original || campos.some((k) => JSON.stringify(original[k] ?? null) !== JSON.stringify(cartaoAberto[k] ?? null));
    if (mudou) {
      const dados = { id: cartaoAberto.id };
      campos.forEach((k) => { dados[k] = cartaoAberto[k]; });
      const r = await api("trello-cartao-salvar", { quadroId: quadro.id, cartao: dados });
      if (!r.ok) { toast(r.erro || "Não foi possível salvar o cartão.", "erro"); return false; }
      const idx = cartoes.findIndex((x) => x.id === r.cartao.id);
      if (idx !== -1) cartoes[idx] = r.cartao; else cartoes.push(r.cartao);
      if (cartaoAberto) cartaoAberto = { ...JSON.parse(JSON.stringify(r.cartao)) };
      renderListas();
      if (!silencioso) toast("Cartão salvo.");
    }
    if (fechar) fecharCartao();
    return true;
  }

  // Eventos do modal
  $("fecharModalCartao").addEventListener("click", () => salvarCartaoAberto({ fechar: true, silencioso: true }));
  $("modalCartao").addEventListener("click", (e) => { if (e.target === $("modalCartao")) salvarCartaoAberto({ fechar: true, silencioso: true }); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("modalCartao").classList.contains("active") && !document.querySelector("#modal-confirmacao-global.active")) {
      salvarCartaoAberto({ fechar: true, silencioso: true });
    }
  });
  $("btnSalvarCartao").addEventListener("click", () => salvarCartaoAberto({ fechar: true }));
  $("tituloCartao").addEventListener("input", ajustarAlturaTitulo);
  $("tituloCartao").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  ["prazoCartao", "concluidoCartao"].forEach((id) => $(id).addEventListener("change", () => { lerCamposModal(); renderMetaCartao(); }));
  ["escolhaResponsaveis", "escolhaEtiquetas"].forEach((id) => $(id).addEventListener("change", () => { lerCamposModal(); renderMetaCartao(); }));
  $("coresCapa").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cor]");
    if (!b) return;
    cartaoAberto.capa = b.dataset.cor;
    $("coresCapa").querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
  });
  $("cartaoLista").addEventListener("change", async (e) => {
    const listaId = e.target.value;
    if (!(await salvarCartaoAberto({ silencioso: true }))) return;
    await moverCartao(cartaoAberto.id, listaId, null);
    const atual = cartoes.find((x) => x.id === cartaoAberto.id);
    if (atual) cartaoAberto.listaId = atual.listaId;
    toast(`Cartão movido para "${(quadro.listas.find((l) => l.id === listaId) || {}).nome || ""}".`);
  });

  // Checklist
  $("formChecklist").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("novoItemChecklist").value.trim();
    if (!t) return;
    cartaoAberto.checklist = cartaoAberto.checklist || [];
    cartaoAberto.checklist.push({ id: "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), texto: t, feito: false });
    $("novoItemChecklist").value = "";
    renderChecklist();
    salvarCartaoAberto({ silencioso: true });
  });
  $("checklistCartao").addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const item = (cartaoAberto.checklist || []).find((i) => i.id === li.dataset.id);
    if (!item) return;
    if (e.target.matches("input[type=checkbox]")) item.feito = e.target.checked;
    else if (e.target.closest(".btn-x")) cartaoAberto.checklist = cartaoAberto.checklist.filter((i) => i !== item);
    else return;
    renderChecklist();
    salvarCartaoAberto({ silencioso: true });
  });

  // Comentários
  $("formComentario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("novoComentario").value.trim();
    if (!texto) return;
    if (!(await salvarCartaoAberto({ silencioso: true }))) return;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    const r = await api("trello-comentario-salvar", { quadroId: quadro.id, cartaoId: cartaoAberto.id, texto });
    btn.disabled = false;
    if (!r.ok) { toast(r.erro || "Não foi possível comentar.", "erro"); return; }
    $("novoComentario").value = "";
    const idx = cartoes.findIndex((x) => x.id === r.cartao.id);
    if (idx !== -1) cartoes[idx] = r.cartao;
    cartaoAberto.comentarios = r.cartao.comentarios;
    renderComentarios();
    renderListas();
  });
  $("novoComentario").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("formComentario").requestSubmit(); });
  $("comentariosCartao").addEventListener("click", async (e) => {
    if (!e.target.matches(".comentario-excluir")) return;
    const id = e.target.closest("li").dataset.id;
    if (!(await confirmarAcao("Excluir comentário?", ""))) return;
    const r = await api("trello-comentario-excluir", { quadroId: quadro.id, cartaoId: cartaoAberto.id, id });
    if (!r.ok) { toast(r.erro || "Não foi possível excluir.", "erro"); return; }
    const idx = cartoes.findIndex((x) => x.id === r.cartao.id);
    if (idx !== -1) cartoes[idx] = r.cartao;
    cartaoAberto.comentarios = r.cartao.comentarios;
    renderComentarios();
    renderListas();
  });

  $("btnExcluirCartao").addEventListener("click", async () => {
    if (!cartaoAberto) return;
    if (!(await confirmarAcao(`Excluir o cartão "${cartaoAberto.titulo}"?`, "Não dá para desfazer."))) return;
    const r = await api("trello-cartao-excluir", { quadroId: quadro.id, id: cartaoAberto.id });
    if (!r.ok) { toast(r.erro || "Não foi possível excluir.", "erro"); return; }
    cartoes = cartoes.filter((x) => x.id !== cartaoAberto.id);
    fecharCartao();
    renderListas();
    toast("Cartão excluído.");
  });

  // ============================================================
  // MODAL DO QUADRO (criar / configurar)
  // ============================================================
  let quadroEditando = null;
  let etiquetasEdicao = [];
  let corQuadroEdicao = CORES[0];

  function abrirModalQuadro(q) {
    quadroEditando = q;
    $("tituloModalQuadro").textContent = q ? "Configurar board" : "Novo board";
    $("campoNomeQuadro").value = q ? q.nome : "";
    corQuadroEdicao = (q && q.cor) || CORES[quadros.length % CORES.length];
    etiquetasEdicao = q ? JSON.parse(JSON.stringify(q.etiquetas || [])) : [];
    $("blocoEtiquetas").hidden = !q; // quadro novo já nasce com etiquetas padrão
    $("btnExcluirQuadro").hidden = !q;
    renderCoresQuadro();
    renderEtiquetasEdicao();
    $("modalQuadro").classList.add("active");
    setTimeout(() => $("campoNomeQuadro").focus(), 50);
  }
  function fecharModalQuadro() { $("modalQuadro").classList.remove("active"); }
  function renderCoresQuadro() {
    $("coresQuadro").innerHTML = CORES.map((cor) => `<button type="button" data-cor="${cor}" class="${cor === corQuadroEdicao ? "ativo" : ""}" style="background:${cor}" title="${cor}"></button>`).join("");
  }
  function renderEtiquetasEdicao() {
    $("listaEtiquetasQuadro").innerHTML = etiquetasEdicao.map((e, i) => `
      <div class="etiqueta-linha" data-i="${i}">
        <input type="color" value="${esc(e.cor)}" aria-label="Cor da etiqueta" />
        <input type="text" value="${esc(e.nome)}" maxlength="30" placeholder="Nome da etiqueta" />
        <button type="button" class="btn-x" aria-label="Remover etiqueta">&times;</button>
      </div>`).join("");
  }
  $("coresQuadro").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cor]");
    if (!b) return;
    corQuadroEdicao = b.dataset.cor;
    renderCoresQuadro();
  });
  $("listaEtiquetasQuadro").addEventListener("input", (e) => {
    const linha = e.target.closest(".etiqueta-linha");
    if (!linha) return;
    const et = etiquetasEdicao[+linha.dataset.i];
    if (e.target.type === "color") et.cor = e.target.value;
    else et.nome = e.target.value;
  });
  $("listaEtiquetasQuadro").addEventListener("click", (e) => {
    if (!e.target.closest(".btn-x")) return;
    etiquetasEdicao.splice(+e.target.closest(".etiqueta-linha").dataset.i, 1);
    renderEtiquetasEdicao();
  });
  $("btnNovaEtiqueta").addEventListener("click", () => {
    etiquetasEdicao.push({ id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nome: "", cor: CORES[etiquetasEdicao.length % CORES.length] });
    renderEtiquetasEdicao();
    const inputs = $("listaEtiquetasQuadro").querySelectorAll("input[type=text]");
    inputs[inputs.length - 1].focus();
  });
  $("fecharModalQuadro").addEventListener("click", fecharModalQuadro);
  $("modalQuadro").addEventListener("click", (e) => { if (e.target === $("modalQuadro")) fecharModalQuadro(); });

  $("formQuadro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = $("campoNomeQuadro").value.trim();
    if (!nome) return;
    const btn = $("btnSalvarQuadro");
    btn.disabled = true;
    const dados = { nome, cor: corQuadroEdicao };
    if (quadroEditando) { dados.id = quadroEditando.id; dados.etiquetas = etiquetasEdicao; }
    const r = await api("trello-quadro-salvar", dados);
    btn.disabled = false;
    if (!r.ok) { toast(r.erro || "Não foi possível salvar o board.", "erro"); return; }
    fecharModalQuadro();
    if (quadroEditando && quadro && quadro.id === r.quadro.id) {
      quadro = r.quadro;
      // etiquetas removidas somem dos cartões na próxima leitura
      await abrirQuadro(quadro.id, { silencioso: true });
    } else {
      await abrirQuadro(r.quadro.id);
    }
  });

  $("btnExcluirQuadro").addEventListener("click", async () => {
    if (!quadroEditando) return;
    const ok = await confirmarAcao(`Excluir o board "${quadroEditando.nome}"?`, "Todas as listas e cartões dele serão apagados. Não dá para desfazer.");
    if (!ok) return;
    const r = await api("trello-quadro-excluir", { id: quadroEditando.id });
    if (!r.ok) { toast(r.erro || "Não foi possível excluir.", "erro"); return; }
    fecharModalQuadro();
    toast("Board excluído.");
    history.pushState({}, "", "quadros.html");
    mostrarLista();
  });

  // ── Barra do quadro ────────────────────────────────────────
  $("btnVoltarQuadros").addEventListener("click", () => {
    history.pushState({}, "", "quadros.html");
    mostrarLista();
  });
  $("btnConfigQuadro").addEventListener("click", () => abrirModalQuadro(quadro));
  $("nomeQuadro").addEventListener("click", () => editarTextoInline($("nomeQuadro"), quadro.nome, async (novo) => {
    const r = await api("trello-quadro-salvar", { id: quadro.id, nome: novo });
    if (!r.ok) { toast(r.erro || "Não foi possível renomear.", "erro"); $("nomeQuadro").textContent = quadro.nome; return; }
    quadro = r.quadro;
    $("nomeQuadro").textContent = quadro.nome;
  }));

  window.addEventListener("popstate", async () => {
    const id = new URLSearchParams(location.search).get("quadro");
    if (id) await abrirQuadro(id, { silencioso: true });
    else mostrarLista();
  });

  // ============================================================
  // INÍCIO
  // ============================================================
  (async function iniciar() {
    const ru = await api("users-list-basic");
    usuarios = ru.ok ? (ru.usuarios || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")) : [];
    const params = new URLSearchParams(location.search);
    const idQuadro = params.get("quadro");
    if (idQuadro && (await abrirQuadro(idQuadro, { silencioso: true }))) {
      const idCartao = params.get("cartao");
      if (idCartao) abrirCartao(idCartao);
      return;
    }
    carregarQuadros();
  })();
})();
