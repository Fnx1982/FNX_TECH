// ============================================================
// obras.js — Lista de obras com abas: Em Andamento, Finalizadas, Lixeira
// ============================================================

const gruposMesesEl    = document.getElementById("gruposMeses");
const semResultadosEl  = document.getElementById("semResultados");
const buscaInput       = document.getElementById("buscaTexto");
const filtroAno        = document.getElementById("filtroAno");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");

const NOMES_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                     "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let abaAtiva = "andamento";

function popularFiltroAno() {
  const obras = lerObras();
  const anos = [...new Set(obras.map((o) => new Date(o.criadoEm).getFullYear()))].sort((a,b)=>b-a);
  const val = filtroAno.value;
  filtroAno.innerHTML = '<option value="todos">Todos</option>';
  anos.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = String(ano); opt.textContent = ano;
    filtroAno.appendChild(opt);
  });
  filtroAno.value = val || "todos";
}

function listaFiltrada() {
  const termo  = buscaInput.value.trim().toLowerCase();
  const anoSel = filtroAno.value;
  const base   = abaAtiva === "lixeira"   ? lerObrasLixeira()
               : abaAtiva === "finalizada" ? lerObrasFinaliz()
               : lerObrasAtivas();
  return base.filter((o) => {
    const dataOK  = anoSel === "todos" || new Date(o.criadoEm).getFullYear() === parseInt(anoSel);
    const buscaOK = termo === "" ||
      (o.cliente||"").toLowerCase().includes(termo) ||
      (o.local||"").toLowerCase().includes(termo) ||
      (o.servico||"").toLowerCase().includes(termo);
    return dataOK && buscaOK;
  });
}

function renderLista() {
  popularFiltroAno();
  const itens = listaFiltrada();
  gruposMesesEl.innerHTML = "";
  semResultadosEl.style.display = itens.length === 0 ? "block" : "none";
  if (itens.length === 0) return;

  const grupos = new Map();
  itens.forEach((obra) => {
    const d = new Date(obra.criadoEm);
    const chave = `${NOMES_MESES[d.getMonth()]} ${d.getFullYear()}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(obra);
  });

  [...grupos.keys()]
    .sort((a,b) => new Date(grupos.get(b)[0].criadoEm) - new Date(grupos.get(a)[0].criadoEm))
    .forEach((chave) => {
      const grupoEl = document.createElement("div");
      grupoEl.className = "grupo-mes";
      grupoEl.innerHTML = `<div class="grupo-mes-titulo">${chave}</div>`;
      const grade = document.createElement("div");
      grade.className = "grade-obras";

      grupos.get(chave)
        .sort((a,b) => new Date(b.criadoEm) - new Date(a.criadoEm))
        .forEach((obra) => {
          const lucro = lucroTotalObra(obra);
          const statusObra = obra.statusObra || "andamento";
          const proposta = obra.propostaId ? buscarProposta(obra.propostaId) : null;
          const numOrc = proposta && proposta.numeroOrcamento
            ? `<span class="card-obra-num">Nº ${escaparHtml(proposta.numeroOrcamento)}</span>` : "";
          const badgeStatus = statusObra === "finalizada"
            ? `<span class="badge-obra badge-finalizada">✓ Finalizada</span>`
            : `<span class="badge-obra badge-andamento">⚙ Em Andamento</span>`;

          const card = document.createElement("div");
          card.className = "card-obra";

          if (abaAtiva === "lixeira") {
            const lixEm = obra.lixeiraEm ? new Date(obra.lixeiraEm).toLocaleDateString("pt-BR") : "—";
            card.innerHTML = `
              ${numOrc}
              <div class="card-obra-cliente">${escaparHtml(obra.cliente)||"(sem nome)"}</div>
              <div class="card-obra-servico">${escaparHtml(obra.servico)||""}</div>
              <div class="card-obra-data" style="color:var(--vermelho,crimson);">Excluída em ${lixEm}</div>
              <div class="card-obra-acoes">
                <button class="btn-restaurar-obra" data-id="${obra.id}">↩ Restaurar</button>
                <button class="btn-excluir-def-obra" data-id="${obra.id}">🗑 Excluir definitivo</button>
              </div>`;
          } else {
            card.innerHTML = `
              <div class="card-obra-topo">
                ${numOrc}
                ${badgeStatus}
              </div>
              <div class="card-obra-cliente">${escaparHtml(obra.cliente)||"(sem nome)"}</div>
              <div class="card-obra-servico">${escaparHtml(obra.servico)||""}</div>
              ${obra.local && typeof htmlLinksMapa === "function" ? `<div class="endereco-com-mapa"><span class="texto-endereco">📍 ${escaparHtml(obra.local)}</span>${htmlLinksMapa(obra.local)}</div>` : ""}
              <div class="card-obra-lucro ${lucro>=0?"positivo":"negativo"}">
                Lucro: R$ ${formatarMoeda(lucro)}
              </div>
              <div class="card-obra-data">Criada em ${new Date(obra.criadoEm).toLocaleDateString("pt-BR")}</div>
              <div class="card-obra-acoes">
                <button class="btn-ver-obra" data-id="${obra.id}">Ver Detalhes</button>
                <button class="btn-status-obra" data-id="${obra.id}" data-status="${statusObra}">
                  ${statusObra==="finalizada"?"↩ Reabrir":"✓ Finalizar"}
                </button>
                <button class="btn-lixeira-obra btn-lixeira-mini" data-id="${obra.id}" title="Mover para lixeira">🗑</button>
              </div>`;
          }
          grade.appendChild(card);
        });

      grupoEl.appendChild(grade);
      gruposMesesEl.appendChild(grupoEl);
    });

  // Listeners
  gruposMesesEl.querySelectorAll(".btn-ver-obra").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); window.location.href = `obra-detalhe.html?id=${btn.dataset.id}`; }));

  gruposMesesEl.querySelectorAll(".btn-status-obra").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const fin = btn.dataset.status === "finalizada";
      const ok = await confirmarAcao(fin?"Reabrir esta obra?":"Finalizar esta obra?", fin?"Volta para Em Andamento.":"Vai para a aba Finalizadas.");
      if (!ok) return;
      await alternarStatusObra(btn.dataset.id);
      renderLista(); atualizarContadoresAbas();
    }));

  gruposMesesEl.querySelectorAll(".btn-lixeira-obra").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmarAcao("Mover para lixeira?", "A obra pode ser restaurada depois.");
      if (!ok) return;
      await excluirObra(btn.dataset.id);
      renderLista(); atualizarContadoresAbas();
      mostrarToast("Obra movida para a lixeira.");
    }));

  gruposMesesEl.querySelectorAll(".btn-restaurar-obra").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await restaurarObra(btn.dataset.id);
      renderLista(); atualizarContadoresAbas();
      mostrarToast("Obra restaurada.");
    }));

  gruposMesesEl.querySelectorAll(".btn-excluir-def-obra").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmarAcao("Excluir definitivamente?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await excluirObraDefinitivo(btn.dataset.id);
      renderLista(); atualizarContadoresAbas();
      mostrarToast("Obra excluída permanentemente.");
    }));
}

function atualizarContadoresAbas() {
  const nAnd = lerObrasAtivas().length;
  const nFin = lerObrasFinaliz().length;
  const nLix = lerObrasLixeira().length;
  const el = (s) => document.querySelector(`[data-aba="${s}"]`);
  if (el("andamento"))  el("andamento").textContent  = `Em Andamento${nAnd>0?` (${nAnd})`:""}`;
  if (el("finalizada")) el("finalizada").textContent  = `Finalizadas${nFin>0?` (${nFin})`:""}`;
  if (el("lixeira"))    el("lixeira").innerHTML        = `🗑 Lixeira${nLix>0?` <span style="color:crimson;font-size:11px;">(${nLix})</span>`:""}`;
}

document.querySelectorAll("[data-aba]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-aba]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    abaAtiva = btn.dataset.aba;
    renderLista();
  });
});

buscaInput.addEventListener("input", renderLista);
filtroAno.addEventListener("change", renderLista);
btnLimparFiltros.addEventListener("click", () => { buscaInput.value=""; filtroAno.value="todos"; renderLista(); });

const paramsUrlObras = new URLSearchParams(window.location.search);
if (paramsUrlObras.get("erro") === "obra_nao_encontrada") {
  mostrarToast("Obra não encontrada.", "erro");
  window.history.replaceState({}, "", "obras.html");
}

(async function inicializarObras() {
  await carregarObrasCache();
  atualizarContadoresAbas();
  renderLista();
})();

// Orçamentos chegaram da nuvem: redesenha a lista
document.addEventListener("propostas-carregadas", () => renderLista());
