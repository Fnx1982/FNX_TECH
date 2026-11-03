// ============================================================
// visita-tecnica.js
// ============================================================

let visitaEmEdicaoId = null;
let visitasCache = [];
let fotosSelecionadas = []; // arquivos escolhidos, ainda não enviados
let fotosJaSalvas = []; // chaves R2 de fotos já salvas (ao editar uma visita existente)
let rascunhoAtualId = null; // id do rascunho de auto-save em andamento (null = ainda não criado)
let medidasVisita = []; // [{ descricao, m1, m2, qtd, unidade }]
let eventoVinculado = null; // { id, titulo } quando a visita veio do Google Agenda
let eventosAgendaCache = [];

const WORKER_URL_VISITA = FNX_API;

function uploadFotoVisita(arquivo) {
  return new Promise((resolve, reject) => {
    const chave = `visitas/${Date.now()}_${arquivo.name}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL_VISITA}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(chave); else reject(new Error("Falha ao enviar foto (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar foto"));
    xhr.send(arquivo);
  });
}

function urlFotoVisita(chave) {
  const token = pegarTokenDownloadCache();
  return `${WORKER_URL_VISITA}?action=get&key=${encodeURIComponent(chave)}&token=${encodeURIComponent(token)}`;
}

// ── Máscara de telefone: (41) 9 9999-9999 ──────────────────────
function aplicarMascaraTelefoneVisita(event) {
  let input = event.target;
  let valor = input.value.replace(/\D/g, "");
  if (valor.length > 11) valor = valor.slice(0, 11);
  if (valor.length > 7) valor = valor.replace(/^(\d{2})(\d{1})(\d{4})(\d{0,4}).*/, "($1) $2 $3-$4");
  else if (valor.length > 3) valor = valor.replace(/^(\d{2})(\d{1})(\d{0,4})/, "($1) $2 $3");
  else if (valor.length > 2) valor = valor.replace(/^(\d{2})(\d{0,1})/, "($1) $2");
  else if (valor.length > 0) valor = valor.replace(/^(\d{0,2})/, "($1");
  input.value = valor.trim();
}
document.getElementById("campoTelefone").addEventListener("input", aplicarMascaraTelefoneVisita);

// ── Prévia das fotos escolhidas (antes de salvar) ────────────────
document.getElementById("campoFotos").addEventListener("change", (e) => {
  fotosSelecionadas = [...e.target.files];
  renderPreviaFotos();
});

function renderPreviaFotos() {
  const container = document.getElementById("previaFotos");
  container.innerHTML = "";

  fotosJaSalvas.forEach((chave, idx) => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;";
    wrapper.innerHTML = `
      <img src="${urlFotoVisita(chave)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;" />
      <button type="button" class="btn-remover-foto-salva" data-idx="${idx}" style="position:absolute;top:-6px;right:-6px;background:#E5141B;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1;">✕</button>
    `;
    wrapper.querySelector(".btn-remover-foto-salva").addEventListener("click", () => {
      fotosJaSalvas.splice(idx, 1);
      renderPreviaFotos();
    });
    container.appendChild(wrapper);
  });

  fotosSelecionadas.forEach((arquivo, idx) => {
    const url = URL.createObjectURL(arquivo);
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;";
    wrapper.innerHTML = `
      <img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:2px solid var(--laranja);" />
      <button type="button" class="btn-remover-foto-nova" data-idx="${idx}" style="position:absolute;top:-6px;right:-6px;background:#E5141B;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1;">✕</button>
    `;
    wrapper.querySelector(".btn-remover-foto-nova").addEventListener("click", () => {
      fotosSelecionadas.splice(idx, 1);
      renderPreviaFotos();
    });
    container.appendChild(wrapper);
  });
}

// ── Formulário: limpar / preencher ──────────────────────────────
function limparFormulario() {
  visitaEmEdicaoId = null;
  rascunhoAtualId = null;
  document.getElementById("campoId").value = "";
  ["campoClienteNome", "campoTelefone", "campoLocal", "campoEndereco", "campoBairro", "campoCidade", "campoDescricao", "campoAnotacoes"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("campoDataVisita").value = hojeISOVisita();
  medidasVisita = [];
  renderMedidas();
  definirEventoVinculado(null);
  fotosSelecionadas = [];
  fotosJaSalvas = [];
  document.getElementById("campoFotos").value = "";
  renderPreviaFotos();
  document.getElementById("tituloFormulario").textContent = "Nova visita";
  document.getElementById("btnCancelarEdicao").style.display = "none";
}

function preencherFormulario(visita) {
  visitaEmEdicaoId = visita.id;
  rascunhoAtualId = null;
  document.getElementById("campoId").value = visita.id;
  document.getElementById("campoClienteNome").value = visita.clienteNome || "";
  document.getElementById("campoTelefone").value = visita.telefone || "";
  document.getElementById("campoLocal").value = visita.local || "";
  document.getElementById("campoEndereco").value = visita.endereco || "";
  document.getElementById("campoBairro").value = visita.bairro || "";
  document.getElementById("campoCidade").value = visita.cidade || "";
  document.getElementById("campoDescricao").value = visita.descricao || "";
  document.getElementById("campoAnotacoes").value = visita.anotacoes || "";
  document.getElementById("campoDataVisita").value = visita.dataVisita || "";
  medidasVisita = Array.isArray(visita.medidas) ? visita.medidas.map((m) => ({ ...m })) : [];
  renderMedidas();
  definirEventoVinculado(visita.eventoCalendarioId ? { id: visita.eventoCalendarioId, titulo: visita.eventoCalendarioTitulo || "" } : null);
  fotosSelecionadas = [];
  fotosJaSalvas = [...(visita.fotos || [])];
  renderPreviaFotos();
  document.getElementById("tituloFormulario").textContent = `Editando — ${visita.clienteNome}`;
  document.getElementById("btnCancelarEdicao").style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("btnCancelarEdicao").addEventListener("click", limparFormulario);

// ====================================================
// RASCUNHO AUTOMÁTICO (auto-save) — salva sozinho ao sair de
// qualquer campo, e ao trocar/fechar a aba. Fotos ainda não
// enviadas (selecionadas mas sem upload concluído) NÃO entram no
// rascunho — só o que já está de fato no R2.
// ====================================================
function coletarDadosRascunhoVisita() {
  return {
    id: visitaEmEdicaoId,
    clienteNome: document.getElementById("campoClienteNome").value.trim(),
    telefone: document.getElementById("campoTelefone").value.trim(),
    local: document.getElementById("campoLocal").value.trim(),
    endereco: document.getElementById("campoEndereco").value.trim(),
    bairro: document.getElementById("campoBairro").value.trim(),
    cidade: document.getElementById("campoCidade").value.trim(),
    descricao: document.getElementById("campoDescricao").value.trim(),
    fotos: [...fotosJaSalvas],
    ...camposExtrasVisita(),
  };
}

function formularioVisitaTemConteudo(d) {
  return !!(d.clienteNome || d.telefone || d.local || d.endereco || d.bairro || d.cidade || d.descricao || d.anotacoes || d.fotos.length || (d.medidas && d.medidas.length));
}

async function salvarRascunhoAtual() {
  const dados = coletarDadosRascunhoVisita();
  if (!formularioVisitaTemConteudo(dados)) return;
  const resposta = await apiSalvarRascunho("visita", rascunhoAtualId, dados);
  if (resposta.ok) { rascunhoAtualId = resposta.id; renderPendentes(); }
}

function salvarRascunhoAtualImediato() {
  const dados = coletarDadosRascunhoVisita();
  if (!formularioVisitaTemConteudo(dados)) return;
  if (!rascunhoAtualId) rascunhoAtualId = `rascunho_visita_${Date.now()}`;
  apiSalvarRascunhoImediato("visita", rascunhoAtualId, dados);
}

["campoClienteNome", "campoTelefone", "campoLocal", "campoEndereco", "campoBairro", "campoCidade", "campoDescricao", "campoAnotacoes", "campoDataVisita"].forEach((idCampo) => {
  document.getElementById(idCampo).addEventListener("blur", salvarRascunhoAtual);
});
// Anotações são digitadas por muito tempo durante a visita: salva o
// rascunho alguns segundos depois que a pessoa para de digitar, sem
// precisar sair do campo (se o celular desligar, não perde o texto).
let timerAnotacoes = null;
document.getElementById("campoAnotacoes").addEventListener("input", () => {
  clearTimeout(timerAnotacoes);
  timerAnotacoes = setTimeout(salvarRascunhoAtual, 3000);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salvarRascunhoAtualImediato(); });
window.addEventListener("beforeunload", salvarRascunhoAtualImediato);

function preencherFormularioComRascunho(dados, idRascunho) {
  rascunhoAtualId = idRascunho;
  visitaEmEdicaoId = dados.id || null;
  document.getElementById("campoId").value = dados.id || "";
  document.getElementById("campoClienteNome").value = dados.clienteNome || "";
  document.getElementById("campoTelefone").value = dados.telefone || "";
  document.getElementById("campoLocal").value = dados.local || "";
  document.getElementById("campoEndereco").value = dados.endereco || "";
  document.getElementById("campoBairro").value = dados.bairro || "";
  document.getElementById("campoCidade").value = dados.cidade || "";
  document.getElementById("campoDescricao").value = dados.descricao || "";
  document.getElementById("campoAnotacoes").value = dados.anotacoes || "";
  document.getElementById("campoDataVisita").value = dados.dataVisita || hojeISOVisita();
  medidasVisita = Array.isArray(dados.medidas) ? dados.medidas.map((m) => ({ ...m })) : [];
  renderMedidas();
  definirEventoVinculado(dados.eventoCalendarioId ? { id: dados.eventoCalendarioId, titulo: dados.eventoCalendarioTitulo || "" } : null);
  fotosSelecionadas = [];
  fotosJaSalvas = [...(dados.fotos || [])];
  renderPreviaFotos();
  document.getElementById("tituloFormulario").textContent = dados.clienteNome ? `Continuando rascunho — ${dados.clienteNome}` : "Continuando rascunho";
  document.getElementById("btnCancelarEdicao").style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderPendentes() {
  const resposta = await apiListarRascunhos("visita");
  const bloco = document.getElementById("blocoPendentes");
  const listaEl = document.getElementById("listaPendentes");
  if (!bloco || !listaEl) return;
  if (!resposta.ok || !resposta.rascunhos || resposta.rascunhos.length === 0) {
    bloco.style.display = "none";
    listaEl.innerHTML = "";
    return;
  }
  bloco.style.display = "block";
  listaEl.innerHTML = "";
  resposta.rascunhos.forEach((r) => {
    const d = r.dados || {};
    const dataFormatada = new Date(r.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const el = document.createElement("div");
    el.className = "item-contato";
    el.innerHTML = `
      <div>
        <div class="nome">${escaparHtml(d.clienteNome) || "(sem cliente)"} <span class="badge-tipo" style="background:#FFF1E6;color:#8A3300;">Pendente</span></div>
        <div class="meta">Salvo automaticamente em ${dataFormatada}</div>
      </div>
      <div class="acoes">
        <button class="btn-continuar-rascunho">Continuar editando</button>
        <button class="btn-excluir-rascunho">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-continuar-rascunho").addEventListener("click", () => preencherFormularioComRascunho(d, r.id));
    el.querySelector(".btn-excluir-rascunho").addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir rascunho pendente?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      await apiExcluirRascunho("visita", r.id);
      renderPendentes();
    });
    listaEl.appendChild(el);
  });
}

// ── Salvar ────────────────────────────────────────────────────
document.getElementById("btnSalvarVisita").addEventListener("click", async () => {
  const clienteNome = document.getElementById("campoClienteNome").value.trim();
  if (!clienteNome) { mostrarToast("Informe o cliente.", "erro"); return; }

  const botao = document.getElementById("btnSalvarVisita");
  const textoOriginal = botao.textContent;
  botao.disabled = true;

  try {
    let chavesFotos = [...fotosJaSalvas];
    if (fotosSelecionadas.length > 0) {
      botao.textContent = "Enviando fotos...";
      for (const arquivo of fotosSelecionadas) {
        const chave = await uploadFotoVisita(arquivo);
        chavesFotos.push(chave);
      }
    }

    botao.textContent = "Salvando...";
    const dados = {
      id: visitaEmEdicaoId,
      clienteNome,
      telefone: document.getElementById("campoTelefone").value.trim(),
      local: document.getElementById("campoLocal").value.trim(),
      endereco: document.getElementById("campoEndereco").value.trim(),
      bairro: document.getElementById("campoBairro").value.trim(),
      cidade: document.getElementById("campoCidade").value.trim(),
      descricao: document.getElementById("campoDescricao").value.trim(),
      fotos: chavesFotos,
      ...camposExtrasVisita(),
    };
    const ehNova = !visitaEmEdicaoId;
    const resposta = await apiSalvarVisita(dados);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar.", "erro"); return; }
    mostrarToast("Visita salva.");
    const visitaSalva = { ...dados, id: resposta.id };
    if (rascunhoAtualId) { await apiExcluirRascunho("visita", rascunhoAtualId); rascunhoAtualId = null; }
    limparFormulario();
    await carregarVisitas();
    renderPendentes();
    renderAgenda(); // marca o agendamento como "visita registrada"

    // Visita nova: já oferece abrir o orçamento dela. Se escolher
    // "depois", ela fica em Orçamento → "Visitas aguardando orçamento".
    if (ehNova) {
      const agora = await confirmarAcao("Visita salva! Criar o orçamento agora?",
        "Se preferir fazer depois, ela fica esperando em Orçamento → \"Visitas aguardando orçamento\".");
      if (agora) abrirOrcamentoDaVisita(visitaSalva);
    }
  } catch (e) {
    mostrarToast(e.message || "Erro ao salvar a visita.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

// ── Listar / buscar / excluir / gerar orçamento ──────────────────
async function carregarVisitas() {
  const resposta = await apiListarVisitas();
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao carregar visitas.", "erro"); return; }
  visitasCache = resposta.visitas;
  renderizarLista();
  if (eventosAgendaCache.length) renderAgenda(); // atualiza quais agendamentos já viraram visita
}

function renderizarLista() {
  const busca = document.getElementById("buscaVisitas").value.trim().toLowerCase();
  let filtradas = visitasCache;
  if (busca) {
    filtradas = filtradas.filter((v) =>
      (v.clienteNome || "").toLowerCase().includes(busca) || (v.local || "").toLowerCase().includes(busca) || (v.endereco || "").toLowerCase().includes(busca)
    );
  }

  const lista = document.getElementById("listaVisitas");
  const vazio = document.getElementById("vazioVisitas");
  lista.innerHTML = "";

  if (filtradas.length === 0) { vazio.style.display = "block"; return; }
  vazio.style.display = "none";

  filtradas.forEach((v) => {
    const el = document.createElement("div");
    el.className = "item-contato";
    const enderecoPartes = [v.local, v.endereco, v.bairro, v.cidade].filter(Boolean).map(escaparHtml).join(" · ");
    const fotoThumb = v.fotos && v.fotos[0] ? `<img src="${urlFotoVisita(v.fotos[0])}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;margin-right:10px;" />` : "";
    el.innerHTML = `
      <div style="display:flex; align-items:center;">
        ${fotoThumb}
        <div>
          <div class="nome">${escaparHtml(v.clienteNome)} ${v.eventoCalendarioId ? '<span class="badge-tipo" style="background:#FFF1E6;color:#8A3300;">📅 Do calendário</span>' : ""} ${v.convertidaEmPropostaId === "dispensada" ? '<span class="badge-tipo" style="background:#EEF0F3;color:#666;">Sem orçamento</span>' : v.convertidaEmPropostaId ? '<span class="badge-tipo" style="background:#E7F6EC;color:#1C8A4B;">Já virou orçamento</span>' : '<span class="badge-tipo" style="background:#FFF1E6;color:#8A3300;">Aguardando orçamento</span>'}</div>
          ${v.endereco || v.cidade ? `<div class="endereco-com-mapa">${htmlLinksMapa(juntarEndereco(v.endereco, v.bairro, v.cidade))}</div>` : ""}
          <div class="meta">${enderecoPartes || "Sem endereço"} · ${v.dataVisita ? dataBRVisita(v.dataVisita) : new Date(v.criadoEm).toLocaleDateString("pt-BR")} · ${(v.fotos || []).length} foto(s)${(v.medidas || []).length ? " · " + escaparHtml(resumoTotaisMedidas(v.medidas)) : ""}</div>
        </div>
      </div>
      <div class="acoes">
        <button class="btn-editar-visita">Editar</button>
        <button class="btn-gerar-orcamento">📝 Gerar orçamento</button>
        <button class="btn-excluir-visita">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-editar-visita").addEventListener("click", () => preencherFormulario(v));

    el.querySelector(".btn-gerar-orcamento").addEventListener("click", () => abrirOrcamentoDaVisita(v));

    el.querySelector(".btn-excluir-visita").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir a visita de "${v.clienteNome}"?`, "");
      if (!ok) return;
      const resp = await apiExcluirVisita(v.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Excluída.");
      carregarVisitas();
    });

    lista.appendChild(el);
  });
}

document.getElementById("buscaVisitas").addEventListener("input", renderizarLista);

// Abre o Orçamento com um orçamento novo já preenchido com a visita.
// "visitaId" faz as fotos da visita aparecerem num quadro no canto.
function abrirOrcamentoDaVisita(v) {
  const dadosProposta = montarOrcamentoDaVisita(v); // visita-para-orcamento.js
  const codificado = btoa(unescape(encodeURIComponent(JSON.stringify(dadosProposta))));
  navegarParaOrcamento(`orcamento.html?dadosVisita=${encodeURIComponent(codificado)}`);
}

function navegarParaOrcamento(url) {
  window.location.href = url;
}

limparFormulario();
garantirTokenDownload().then(() => {
  carregarVisitas();
  renderPendentes();
});

// ====================================================
// UTILITÁRIOS
// ====================================================
function hojeISOVisita() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dataBRVisita(iso) {
  const [a, m, d] = String(iso).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
function numeroBR(texto) {
  // Aceita vírgula OU ponto como casa decimal: "0,5" e "0.5" = meio.
  // (Antes o ponto era tratado como milhar: 0.5 virava 5 e 0.5 x 0.5 dava 25 m².)
  // Só quando tem vírgula é que o ponto vale como milhar: "1.234,5".
  let t = String(texto || "").trim().replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, ""); // 1.234.567
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
function formatarNumeroBR(n) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function camposExtrasVisita() {
  return {
    dataVisita: document.getElementById("campoDataVisita").value || "",
    anotacoes: document.getElementById("campoAnotacoes").value.trim(),
    medidas: medidasVisita.filter((m) => (m.descricao || "").trim() || m.m1 || m.m2),
    eventoCalendarioId: eventoVinculado ? eventoVinculado.id : null,
    eventoCalendarioTitulo: eventoVinculado ? eventoVinculado.titulo : "",
    origem: eventoVinculado ? "calendario" : "avulsa",
  };
}

// Mostra se a visita do formulário veio do calendário ou é avulsa
function definirEventoVinculado(evento) {
  eventoVinculado = evento;
  const el = document.getElementById("origemVisita");
  if (!el) return;
  if (evento) {
    el.innerHTML = `<span class="tag-origem calendario">📅 Do calendário${evento.titulo ? ": " + escaparHtml(evento.titulo) : ""}</span>
      <button type="button" id="btnDesvincularEvento" style="background:none;border:none;color:#888;font-size:12px;cursor:pointer;text-decoration:underline;">tornar avulsa</button>`;
    document.getElementById("btnDesvincularEvento").addEventListener("click", () => definirEventoVinculado(null));
  } else {
    el.innerHTML = '<span class="tag-origem avulsa">Visita avulsa (sem agendamento)</span>';
  }
}

// ====================================================
// MEDIDAS — cada linha: descrição, medida 1 × medida 2, quantidade
// e unidade. m² = m1 × m2 × qtd · m (linear) = m1 × qtd · un = qtd.
// Aceita vírgula (12,5).
// ====================================================
function resultadoMedida(m) {
  const qtd = numeroBR(m.qtd) || 1;
  if (m.unidade === "m") return { valor: numeroBR(m.m1) * qtd, unidade: "m" };
  if (m.unidade === "un") return { valor: numeroBR(m.qtd) || 0, unidade: "un" };
  return { valor: numeroBR(m.m1) * numeroBR(m.m2) * qtd, unidade: "m²" };
}

function resumoTotaisMedidas(medidas) {
  const totais = {};
  (medidas || []).forEach((m) => {
    const r = resultadoMedida(m);
    if (r.valor) totais[r.unidade] = (totais[r.unidade] || 0) + r.valor;
  });
  return Object.entries(totais).map(([u, v]) => `${formatarNumeroBR(v)} ${u}`).join(" · ");
}

function textoMedidasParaOrcamento(medidas) {
  const linhas = (medidas || []).filter((m) => (m.descricao || "").trim() || m.m1).map((m) => {
    const r = resultadoMedida(m);
    const qtd = numeroBR(m.qtd) > 1 ? ` (x${formatarNumeroBR(numeroBR(m.qtd))})` : "";
    let conta = "";
    if (r.unidade === "m²") conta = `${m.m1 || 0} × ${m.m2 || 0} m${qtd} = ${formatarNumeroBR(r.valor)} m²`;
    else if (r.unidade === "m") conta = `${m.m1 || 0} m${qtd} = ${formatarNumeroBR(r.valor)} m`;
    else conta = `${formatarNumeroBR(r.valor)} un`;
    return `- ${m.descricao || "Medida"}: ${conta}`;
  });
  if (!linhas.length) return "";
  return `Medidas da visita:\n${linhas.join("\n")}\nTotal: ${resumoTotaisMedidas(medidas)}`;
}

function renderMedidas() {
  const lista = document.getElementById("listaMedidas");
  if (!lista) return;
  if (!medidasVisita.length) {
    lista.innerHTML = "";
  } else {
    lista.innerHTML = `
      <div class="linha-medida cab-medidas"><span>Descrição / ambiente</span><span>Medida 1</span><span></span><span>Medida 2</span><span>Qtd</span><span>Unidade</span><span style="text-align:right">Resultado</span><span></span></div>
      ${medidasVisita.map((m, i) => `
        <div class="linha-medida" data-medida="${i}">
          <input class="med-desc" type="text" placeholder="Ex.: Fachada frente" value="${escaparHtml(m.descricao || "")}" data-campo="descricao" />
          <input type="text" inputmode="decimal" placeholder="m" value="${escaparHtml(m.m1 || "")}" data-campo="m1" />
          <span class="vezes">×</span>
          <input type="text" inputmode="decimal" placeholder="m" value="${escaparHtml(m.m2 || "")}" data-campo="m2" ${m.unidade === "m" || m.unidade === "un" ? "disabled" : ""} />
          <input class="med-qtd" type="text" inputmode="decimal" placeholder="1" value="${escaparHtml(m.qtd || "")}" data-campo="qtd" />
          <select class="med-unid" data-campo="unidade">
            <option value="m2" ${!m.unidade || m.unidade === "m2" ? "selected" : ""}>m²</option>
            <option value="m" ${m.unidade === "m" ? "selected" : ""}>m (linear)</option>
            <option value="un" ${m.unidade === "un" ? "selected" : ""}>unidade</option>
          </select>
          <span class="resultado-medida"></span>
          <button type="button" class="btn-remover-medida" title="Remover">&times;</button>
        </div>`).join("")}`;
  }

  lista.querySelectorAll(".linha-medida[data-medida]").forEach((linha) => {
    const i = Number(linha.dataset.medida);
    const atualizarResultado = () => {
      const r = resultadoMedida(medidasVisita[i]);
      linha.querySelector(".resultado-medida").textContent = r.valor ? `${formatarNumeroBR(r.valor)} ${r.unidade}` : "—";
      document.getElementById("totalMedidas").textContent = resumoTotaisMedidas(medidasVisita) ? "Total: " + resumoTotaisMedidas(medidasVisita) : "";
    };
    linha.querySelectorAll("[data-campo]").forEach((campo) => {
      campo.addEventListener("input", () => {
        medidasVisita[i][campo.dataset.campo] = campo.value;
        if (campo.dataset.campo === "unidade") {
          linha.querySelector('[data-campo="m2"]').disabled = campo.value !== "m2";
        }
        atualizarResultado();
      });
      campo.addEventListener("blur", salvarRascunhoAtual);
    });
    linha.querySelector(".btn-remover-medida").addEventListener("click", () => {
      medidasVisita.splice(i, 1);
      renderMedidas();
      salvarRascunhoAtual();
    });
    atualizarResultado();
  });
  document.getElementById("totalMedidas").textContent = resumoTotaisMedidas(medidasVisita) ? "Total: " + resumoTotaisMedidas(medidasVisita) : "";
}

document.getElementById("btnAddMedida").addEventListener("click", () => {
  medidasVisita.push({ descricao: "", m1: "", m2: "", qtd: "", unidade: "m2" });
  renderMedidas();
  const linhas = document.querySelectorAll("#listaMedidas .linha-medida[data-medida] .med-desc");
  if (linhas.length) linhas[linhas.length - 1].focus();
});

// ====================================================
// AGENDA DO GOOGLE — lista os agendamentos e transforma em visita
// ====================================================
// O descritivo do Google pode vir com HTML (negrito, links, <br>)
function textoSemHtml(html) {
  const comQuebras = String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
  const doc = new DOMParser().parseFromString(comQuebras, "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// Endereço do Google Maps costuma vir assim:
// "Rua Treze de Maio, 301 - Centro, Curitiba - PR, 80020-270, Brasil"
// Tenta separar rua/número, bairro e cidade. Se não reconhecer o
// formato, põe tudo em Endereço.
function separarEnderecoGoogle(texto) {
  const partes = String(texto || "").split(",").map((p) => p.trim()).filter(Boolean);
  const resultado = { endereco: String(texto || "").trim(), bairro: "", cidade: "" };
  if (partes.length >= 3 && partes[1].includes(" - ")) {
    const [numero, bairro] = partes[1].split(" - ").map((s) => s.trim());
    const cidade = partes[2].split(" - ")[0].trim();
    resultado.endereco = `${partes[0]}, ${numero}`;
    resultado.bairro = bairro || "";
    resultado.cidade = /\d{5}-?\d{3}/.test(cidade) ? "" : cidade;
  } else if (partes.length === 2 && partes[1].split(" - ").length >= 3) {
    // Formato do próprio EnJob: "Rua X, 100 - Bairro - Cidade"
    const [numero, bairro, cidade] = partes[1].split(" - ").map((s) => s.trim());
    resultado.endereco = `${partes[0]}, ${numero}`;
    resultado.bairro = bairro || "";
    resultado.cidade = cidade || "";
  }
  return resultado;
}

function periodoAgenda() {
  const agora = new Date();
  const dia = 24 * 60 * 60 * 1000;
  const v = document.getElementById("periodoAgenda").value;
  if (v === "proximas") return { inicio: new Date(agora.getTime() - dia), fim: new Date(agora.getTime() + 30 * dia) };
  if (v === "passadas") return { inicio: new Date(agora.getTime() - 60 * dia), fim: agora };
  return { inicio: new Date(agora.getTime() - 30 * dia), fim: new Date(agora.getTime() + 30 * dia) };
}

async function carregarAgendaVisitas() {
  const lista = document.getElementById("listaAgenda");
  if (!lista) return;
  if (typeof isGoogleAuthenticated !== "function" || !isGoogleAuthenticated()) {
    lista.innerHTML = '<div class="vazio-agenda">Seu Gmail não está conectado. Conecte uma vez na tela do <a href="calendario.html">Calendário</a> e os agendamentos aparecem aqui.<br>Enquanto isso, dá para registrar uma <b>visita avulsa</b> no formulário abaixo.</div>';
    return;
  }
  lista.innerHTML = '<div class="vazio-agenda">Carregando o calendário…</div>';
  const { inicio, fim } = periodoAgenda();
  try {
    const resp = await gapi.client.calendar.events.list({
      calendarId: "primary",
      timeMin: inicio.toISOString(),
      timeMax: fim.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      showDeleted: false,
    });
    eventosAgendaCache = (resp.result.items || []).filter((ev) => ev.status !== "cancelled");
    renderAgenda();
  } catch (e) {
    console.error("[visita] Erro ao ler o calendário:", e);
    lista.innerHTML = '<div class="vazio-agenda">Não foi possível ler o calendário agora. Recarregue a página.</div>';
  }
}

function dataInicioEvento(ev) {
  if (ev.start && ev.start.dateTime) return new Date(ev.start.dateTime);
  if (ev.start && ev.start.date) return new Date(ev.start.date + "T00:00:00");
  return null;
}

function renderAgenda() {
  const lista = document.getElementById("listaAgenda");
  if (!lista || !eventosAgendaCache.length && lista.textContent.includes("Gmail")) return;
  const busca = normalizarBuscaVisita(document.getElementById("buscaAgenda").value);
  // Só visitas (o resto — pagamentos, reuniões — fica escondido, a
  // menos que marque "mostrar também os outros eventos")
  const mostrarTodos = document.getElementById("mostrarTodosEventosAgenda")?.checked;
  const soVisitas = eventosAgendaCache.filter((ev) => tipoEventoEnjob(ev) === "visita");
  const contagem = document.getElementById("contagemOutrosAgenda");
  const outros = eventosAgendaCache.length - soVisitas.length;
  if (contagem) contagem.textContent = !mostrarTodos && outros ? `(${outros} outro(s) evento(s) escondido(s))` : "";
  let eventos = mostrarTodos ? eventosAgendaCache : soVisitas;
  if (busca) {
    eventos = eventos.filter((ev) => { const pv = ev.extendedProperties?.private || {}; return normalizarBuscaVisita([ev.summary, ev.location, ev.description, pv.clientePagamento, pv.localNome, pv.clienteVisita].join(" ")).includes(busca); });
  }
  if (!eventos.length) {
    lista.innerHTML = `<div class="vazio-agenda">Nenhuma visita agendada nesse período.${outros && !mostrarTodos ? " Marque \"mostrar também os outros eventos\" se a visita foi agendada sem o tipo Visita técnica." : ""}</div>`;
    return;
  }
  lista.innerHTML = "";
  eventos.forEach((ev) => {
    const pv = ev.extendedProperties?.private || {};
    const cliente = pv.enjobTipo ? "" : (pv.clientePagamento || ""); // eventos novos já têm o nome no título
    const tipoEv = tipoEventoEnjob(ev);
    const inicioEv = dataInicioEvento(ev);
    const dataTexto = inicioEv
      ? inicioEv.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) + (ev.start.dateTime ? " · " + inicioEv.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "")
      : "";
    const visitaExistente = visitasCache.find((v) => v.eventoCalendarioId === ev.id);
    const descricao = textoSemHtml(ev.description);
    const el = document.createElement("div");
    el.className = "item-agenda" + (visitaExistente ? " registrada" : "");
    el.innerHTML = `
      <div style="min-width:0;">
        <div class="data-agenda">${escaparHtml(dataTexto)}</div>
        <div class="titulo-agenda">${escaparHtml(cliente ? cliente + " — " : "")}${escaparHtml(ev.summary || "(sem título)")}${tipoEv !== "visita" ? `<span class="tag-tipo-agenda ${tipoEv}">${tipoEv === "pagamento" ? "pagamento" : "outro"}</span>` : ""}</div>
        ${pv.clienteVisita || pv.telefone ? `<div class="info-agenda">👤 ${escaparHtml([pv.clienteVisita, pv.telefone].filter(Boolean).join(" · "))}</div>` : ""}
        ${ev.location ? `<div class="info-agenda">📍 ${escaparHtml(ev.location)}</div><div class="endereco-com-mapa">${htmlLinksMapa(ev.location)}</div>` : ""}
        ${descricao ? `<div class="desc-agenda">${escaparHtml(descricao)}</div>` : ""}
      </div>
      ${visitaExistente
        ? '<button type="button" class="btn-registrar-agenda" style="background:#1C8A4B">✓ Ver visita</button>'
        : '<button type="button" class="btn-registrar-agenda">Registrar visita</button>'}
    `;
    el.querySelector(".btn-registrar-agenda").addEventListener("click", () => {
      if (visitaExistente) preencherFormulario(visitaExistente);
      else registrarVisitaDoEvento(ev);
    });
    lista.appendChild(el);
  });
}

function normalizarBuscaVisita(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Joga o agendamento no formulário: cliente, data, endereço e descritivo
async function registrarVisitaDoEvento(ev) {
  const temAlgo = formularioVisitaTemConteudo(coletarDadosRascunhoVisita());
  if (temAlgo) {
    const ok = await confirmarAcao("Substituir o que está no formulário?", "O formulário já tem informações. Elas continuam salvas em Pendentes.");
    if (!ok) return;
    await salvarRascunhoAtual();
  }
  limparFormulario();
  const pv = ev.extendedProperties?.private || {};
  const novo = !!pv.enjobTipo; // evento criado já com os campos de visita
  const cliente = novo ? (pv.clienteVisita || pv.localNome || "") : (pv.clientePagamento || "");
  const end = separarEnderecoGoogle(ev.location);
  const inicioEv = dataInicioEvento(ev);
  const p = (n) => String(n).padStart(2, "0");
  document.getElementById("campoClienteNome").value = cliente || ev.summary || "";
  // Nome do local (condomínio/empresa): vem da agenda e depois vai pro orçamento
  document.getElementById("campoLocal").value = novo ? (pv.localNome || "") : "";
  if (pv.telefone) document.getElementById("campoTelefone").value = pv.telefone;
  document.getElementById("campoEndereco").value = end.endereco;
  document.getElementById("campoBairro").value = end.bairro;
  document.getElementById("campoCidade").value = end.cidade;
  if (inicioEv) document.getElementById("campoDataVisita").value = `${inicioEv.getFullYear()}-${p(inicioEv.getMonth() + 1)}-${p(inicioEv.getDate())}`;
  // Se o evento tem cliente separado, o título (ex.: "Vistoria fachada")
  // entra como primeira linha do descritivo.
  const descricao = textoSemHtml(ev.description);
  document.getElementById("campoDescricao").value = novo ? descricao : [cliente ? ev.summary : "", descricao].filter(Boolean).join("\n");
  definirEventoVinculado({ id: ev.id, titulo: ev.summary || "" });
  document.getElementById("tituloFormulario").textContent = `Nova visita — ${cliente || ev.summary || ""}`;
  document.getElementById("btnCancelarEdicao").style.display = "inline-block";
  window.scrollTo({ top: document.getElementById("tituloFormulario").getBoundingClientRect().top + window.scrollY - 20, behavior: "smooth" });
  mostrarToast("Agendamento trazido para o formulário. Complete com medidas e fotos e salve.");
}

document.getElementById("periodoAgenda").addEventListener("change", carregarAgendaVisitas);
document.getElementById("mostrarTodosEventosAgenda").addEventListener("change", renderAgenda);

// Botões Maps/Waze do formulário: acompanham o endereço digitado
function atualizarMapaFormVisita() {
  const el = document.getElementById("mapaFormVisita");
  if (!el) return;
  const endereco = juntarEndereco(
    document.getElementById("campoEndereco").value,
    document.getElementById("campoBairro").value,
    document.getElementById("campoCidade").value
  );
  el.innerHTML = htmlLinksMapa(endereco);
}
["campoEndereco", "campoBairro", "campoCidade"].forEach((id) => document.getElementById(id).addEventListener("input", atualizarMapaFormVisita));
// Quando o formulário é preenchido pelo próprio site (editar, rascunho,
// agendamento), os campos mudam sem digitação — confere a cada meio segundo.
setInterval(atualizarMapaFormVisita, 500);
document.getElementById("buscaAgenda").addEventListener("input", renderAgenda);

