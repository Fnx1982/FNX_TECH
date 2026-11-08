// ============================================================
// boletos.js
// Controle de boletos (despesas e entradas), agora no banco
// central (não mais localStorage) — com upload de arquivo de
// verdade (R2), banco vinculado, e modo "vários boletos" numa
// leva só, cada um com seu próprio nome/valor/vencimento.
//
// Status calculado automaticamente pela data de vencimento:
//   - "pago": foi marcado manualmente ou tem comprovante anexado
//   - "atrasado": não pago e data de vencimento já passou
//   - "pendente": não pago e ainda dentro do prazo (ou sem data)
// ============================================================

const WORKER_URL_BOLETOS = FNX_API;
const NOMES_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ====================================================
// UPLOAD / VISUALIZAÇÃO DE ARQUIVO NO R2
// ====================================================
function uploadArquivoBoleto(chave, arquivo) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL_BOLETOS}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(); else reject(new Error("Falha ao enviar o arquivo (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo"));
    xhr.send(arquivo);
  });
}

async function urlDeVisualizacao(chave) {
  const token = await garantirTokenDownload();
  return `${WORKER_URL_BOLETOS}?action=get&key=${encodeURIComponent(chave)}&token=${encodeURIComponent(token)}`;
}

// ====================================================
// ELEMENTOS
// ====================================================
const modalBoleto = document.getElementById("modalBoleto");
const btnNovoBoleto = document.getElementById("btnNovoBoleto");
const fecharModalBoleto = document.getElementById("fecharModalBoleto");
const tituloModalBoleto = document.getElementById("tituloModalBoleto");
const form = document.getElementById("form-boleto");
const btnSubmitBoleto = document.getElementById("btnSubmitBoleto");
const btnTipoDespesa = document.getElementById("btnTipoDespesa");
const btnTipoEntrada = document.getElementById("btnTipoEntrada");
const inputTipoBoleto = document.getElementById("tipoBoleto");
const campoArquivoComprovante = document.getElementById("campoArquivoComprovante");
const avisoMarcaPago = document.getElementById("avisoMarcaPago");
const campoBancoBoleto = document.getElementById("campoBancoBoleto");

const btnUmBoleto = document.getElementById("btnUmBoleto");
const btnVariosBoletos = document.getElementById("btnVariosBoletos");
const blocoUmBoleto = document.getElementById("blocoUmBoleto");
const blocoVariosBoletos = document.getElementById("blocoVariosBoletos");
const corpoTabelaLote = document.getElementById("corpoTabelaLote");
const btnAddLinhaLote = document.getElementById("btnAddLinhaLote");
const labelArquivoBoleto = document.getElementById("labelArquivoBoleto");
const labelArquivoComprovante = document.getElementById("labelArquivoComprovante");
const avisoArquivosVarios = document.getElementById("avisoArquivosVarios");

const listaBoletosEl = document.getElementById("listaBoletos");
const semResultadosEl = document.getElementById("semResultados");
const buscaInput = document.getElementById("buscaTexto");
const filtroTipo = document.getElementById("filtroTipo");
const filtroBanco = document.getElementById("filtroBanco");
const filtroMes = document.getElementById("filtroMes");
const filtroAno = document.getElementById("filtroAno");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const abasStatus = document.querySelectorAll("[data-status-aba]");
const contadorAtrasadosEl = document.getElementById("contadorAtrasados");

const popupArquivo = document.getElementById("popup-arquivo");
const popupArquivoBody = document.getElementById("popup-arquivo-body");
const fecharPopupArquivo = document.getElementById("fecharPopupArquivo");
const btnFecharPopupArquivo = document.getElementById("btn-fechar-popup-arquivo");

// ====================================================
// ESTADO
// ====================================================
let boletos = [];
let idEditando = null;
let tipoSelecionadoModal = "despesa";
let modoQuantidade = "um"; // "um" | "varios"
let abaAtiva = "pendente";
let contadorLinhasLote = 0;

async function carregarBoletos() {
  const resp = await apiListarBoletos();
  boletos = resp.ok ? resp.boletos : [];
}
async function salvarUmBoleto(dados) {
  const resp = await apiSalvarBoleto(dados);
  if (resp.ok) {
    const idx = boletos.findIndex((b) => b.id === resp.id);
    if (idx !== -1) boletos[idx] = resp.boleto;
    else boletos.push(resp.boleto);
  }
  return resp;
}

// ====================================================
// CÁLCULO DE STATUS (pendente / atrasado / pago)
// ====================================================
function hojeSemHora() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function calcularStatus(boleto) {
  if (boleto.pago) return "pago";
  if (!boleto.dataVencimento) return "pendente";

  const vencimento = new Date(boleto.dataVencimento + "T00:00:00");
  const hoje = hojeSemHora();
  return vencimento < hoje ? "atrasado" : "pendente";
}

function diasParaVencer(boleto) {
  if (!boleto.dataVencimento) return null;
  const vencimento = new Date(boleto.dataVencimento + "T00:00:00");
  const hoje = hojeSemHora();
  const diffMs = vencimento - hoje;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function textoPrazo(boleto) {
  const status = calcularStatus(boleto);
  if (status === "pago") return "Pago";

  const dias = diasParaVencer(boleto);
  if (dias === null) return "Sem data de vencimento";
  if (status === "atrasado") {
    const diasAtraso = Math.abs(dias);
    return `Atrasado há ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}`;
  }
  if (dias === 0) return "Vence hoje";
  return `Faltam ${dias} dia${dias !== 1 ? "s" : ""} para vencer`;
}

// ====================================================
// MODAL — abrir / fechar
// ====================================================
function abrirModal() {
  modalBoleto.classList.add("active");
}
function fecharModalEl() {
  modalBoleto.classList.remove("active");
}

btnNovoBoleto.addEventListener("click", () => {
  if (idEditando === null) {
    form.reset();
    definirTipoModal("despesa");
    definirModoQuantidade("um");
    tituloModalBoleto.textContent = "Novo Boleto";
    btnSubmitBoleto.textContent = "Adicionar";
    avisoMarcaPago.style.display = "none";
    corpoTabelaLote.innerHTML = "";
    adicionarLinhaLote();
  }
  abrirModal();
});
fecharModalBoleto.addEventListener("click", fecharModalEl);
modalBoleto.addEventListener("click", (e) => {
  if (e.target === modalBoleto) fecharModalEl();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalEl();
});

function definirTipoModal(tipo) {
  tipoSelecionadoModal = tipo;
  inputTipoBoleto.value = tipo;
  btnTipoDespesa.classList.toggle("active", tipo === "despesa");
  btnTipoEntrada.classList.toggle("active", tipo === "entrada");
}
btnTipoDespesa.addEventListener("click", () => definirTipoModal("despesa"));
btnTipoEntrada.addEventListener("click", () => definirTipoModal("entrada"));

// ── Um boleto vs. Vários boletos numa leva só ────────────────
function definirModoQuantidade(modo) {
  modoQuantidade = modo;
  btnUmBoleto.classList.toggle("active", modo === "um");
  btnVariosBoletos.classList.toggle("active", modo === "varios");
  blocoUmBoleto.style.display = modo === "um" ? "grid" : "none";
  blocoVariosBoletos.style.display = modo === "varios" ? "block" : "none";
  // Upload de arquivo só faz sentido pra um boleto de cada vez —
  // pra leva, anexa depois, editando cada um individualmente.
  labelArquivoBoleto.style.display = modo === "um" ? "block" : "none";
  labelArquivoComprovante.style.display = modo === "um" ? "block" : "none";
  avisoArquivosVarios.style.display = modo === "varios" ? "block" : "none";
}
btnUmBoleto.addEventListener("click", () => definirModoQuantidade("um"));
btnVariosBoletos.addEventListener("click", () => definirModoQuantidade("varios"));

function adicionarLinhaLote(dados) {
  dados = dados || { codigo: "", valor: "", dataVencimento: "" };
  const linhaId = "lote_" + (contadorLinhasLote++);
  const tr = document.createElement("tr");
  tr.dataset.linhaId = linhaId;
  tr.innerHTML = `
    <td><input type="text" class="lote-codigo" placeholder="Código" value="${escaparHtml(dados.codigo)}" /></td>
    <td><input type="number" class="lote-valor" placeholder="0,00" step="0.01" min="0" value="${escaparHtml(dados.valor)}" /></td>
    <td><input type="date" class="lote-vencimento" value="${escaparHtml(dados.dataVencimento)}" /></td>
    <td><button type="button" class="btn-remover-linha" data-remover-linha="${linhaId}">✕</button></td>
  `;
  corpoTabelaLote.appendChild(tr);
  tr.querySelector("[data-remover-linha]").addEventListener("click", () => tr.remove());
}
btnAddLinhaLote.addEventListener("click", () => adicionarLinhaLote());

// Mostra um aviso quando o usuário escolhe um arquivo de comprovante,
// avisando que isso vai marcar o boleto como pago automaticamente.
campoArquivoComprovante.addEventListener("change", () => {
  avisoMarcaPago.style.display = campoArquivoComprovante.files[0] ? "block" : "none";
});

// ====================================================
// CADASTRO / EDIÇÃO
// ====================================================
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnSubmitBoleto.disabled = true;
  const textoOriginalBotao = btnSubmitBoleto.textContent;
  btnSubmitBoleto.textContent = "Salvando...";

  try {
    const nomeComum = document.getElementById("campoNomeBoleto").value.trim();
    const dataCadastro = document.getElementById("campoDataCadastroBoleto").value;
    const observacao = document.getElementById("campoObservacaoBoleto").value.trim();
    const banco = campoBancoBoleto.value;

    if (idEditando !== null) {
      // Edição: sempre um boleto só (não dá pra editar uma leva
      // inteira de uma vez — cada um se edita individual).
      const arquivoBoleto = document.getElementById("campoArquivoBoleto").files[0];
      const arquivoComprovante = campoArquivoComprovante.files[0];

      const registro = { ...boletos.find((b) => b.id === idEditando) };
      registro.nome = nomeComum;
      registro.codigo = document.getElementById("campoCodigoBoleto").value.trim();
      const valorStr = document.getElementById("campoValorBoleto").value;
      registro.valor = valorStr === "" ? null : parseFloat(valorStr);
      registro.dataCadastro = dataCadastro;
      registro.dataVencimento = document.getElementById("campoDataVencimentoBoleto").value;
      registro.observacao = observacao;
      registro.tipo = tipoSelecionadoModal;
      registro.banco = banco;

      if (arquivoBoleto) {
        const chave = `Boletos/${registro.id}_boleto_${arquivoBoleto.name}`;
        await uploadArquivoBoleto(chave, arquivoBoleto);
        registro.arquivoBoletoChave = chave;
      }
      if (arquivoComprovante) {
        const chave = `Boletos/${registro.id}_comprovante_${arquivoComprovante.name}`;
        await uploadArquivoBoleto(chave, arquivoComprovante);
        registro.arquivoComprovanteChave = chave;
        registro.pago = true; // anexar comprovante marca como pago automaticamente
      }

      const resp = await salvarUmBoleto(registro);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao salvar.", "erro"); return; }

      idEditando = null;
      btnSubmitBoleto.textContent = "Adicionar";
      tituloModalBoleto.textContent = "Novo Boleto";
    } else if (modoQuantidade === "um") {
      const arquivoBoleto = document.getElementById("campoArquivoBoleto").files[0];
      const arquivoComprovante = campoArquivoComprovante.files[0];

      const registro = {
        tipo: tipoSelecionadoModal, banco, nome: nomeComum,
        codigo: document.getElementById("campoCodigoBoleto").value.trim(),
        valor: document.getElementById("campoValorBoleto").value === "" ? null : parseFloat(document.getElementById("campoValorBoleto").value),
        dataCadastro, dataVencimento: document.getElementById("campoDataVencimentoBoleto").value,
        observacao, pago: false,
      };

      const respCriar = await salvarUmBoleto(registro);
      if (!respCriar.ok) { mostrarToast(respCriar.erro || "Erro ao salvar.", "erro"); return; }

      // Upload depois de já ter um id (a chave do arquivo usa o id)
      if (arquivoBoleto || arquivoComprovante) {
        const atualizado = { ...respCriar.boleto };
        if (arquivoBoleto) {
          const chave = `Boletos/${atualizado.id}_boleto_${arquivoBoleto.name}`;
          await uploadArquivoBoleto(chave, arquivoBoleto);
          atualizado.arquivoBoletoChave = chave;
        }
        if (arquivoComprovante) {
          const chave = `Boletos/${atualizado.id}_comprovante_${arquivoComprovante.name}`;
          await uploadArquivoBoleto(chave, arquivoComprovante);
          atualizado.arquivoComprovanteChave = chave;
          atualizado.pago = true;
        }
        await salvarUmBoleto(atualizado);
      }
    } else {
      // Vários boletos numa leva — cada linha vira seu próprio
      // registro, todos com o mesmo loteId pra ficar visualmente
      // agrupados na lista.
      const linhas = [...corpoTabelaLote.querySelectorAll("tr")];
      if (linhas.length === 0) { mostrarToast("Adicione pelo menos um boleto na leva.", "erro"); return; }

      const loteId = "lote_" + Date.now();
      for (const tr of linhas) {
        const codigo = tr.querySelector(".lote-codigo").value.trim();
        const valorStr = tr.querySelector(".lote-valor").value;
        const dataVencimento = tr.querySelector(".lote-vencimento").value;
        await salvarUmBoleto({
          tipo: tipoSelecionadoModal, banco, nome: nomeComum, codigo,
          valor: valorStr === "" ? null : parseFloat(valorStr),
          dataCadastro, dataVencimento, observacao, pago: false, loteId,
        });
      }
    }

    form.reset();
    avisoMarcaPago.style.display = "none";
    fecharModalEl();
    renderTudo();
    mostrarToast("Salvo com sucesso.");
  } catch (erro) {
    mostrarToast("Erro: " + erro.message, "erro");
  } finally {
    btnSubmitBoleto.disabled = false;
    btnSubmitBoleto.textContent = textoOriginalBotao === "Salvando..." ? "Adicionar" : textoOriginalBotao;
  }
});

function editar(id) {
  const b = boletos.find((x) => x.id === id);
  if (!b) return;
  definirModoQuantidade("um"); // editar sempre mexe em um boleto por vez
  document.getElementById("campoNomeBoleto").value = b.nome || "";
  document.getElementById("campoCodigoBoleto").value = b.codigo || "";
  document.getElementById("campoValorBoleto").value = b.valor !== null && b.valor !== undefined ? b.valor : "";
  document.getElementById("campoDataCadastroBoleto").value = b.dataCadastro || "";
  document.getElementById("campoDataVencimentoBoleto").value = b.dataVencimento || "";
  document.getElementById("campoObservacaoBoleto").value = b.observacao || "";
  campoBancoBoleto.value = b.banco || "";
  definirTipoModal(b.tipo || "despesa");
  avisoMarcaPago.style.display = "none";

  idEditando = id;
  tituloModalBoleto.textContent = "Editar Boleto";
  btnSubmitBoleto.textContent = "Salvar Alterações";
  abrirModal();
}

async function excluir(id) {
  const confirmado = await confirmarAcao("Excluir boleto?", "Essa ação não pode ser desfeita.");
  if (!confirmado) return;
  const resp = await apiExcluirBoleto(id);
  if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
  boletos = boletos.filter((b) => b.id !== id);
  if (idEditando === id) {
    idEditando = null;
    form.reset();
    btnSubmitBoleto.textContent = "Adicionar";
    tituloModalBoleto.textContent = "Novo Boleto";
  }
  renderTudo();
}

async function marcarComoPago(id) {
  const confirmado = await confirmarAcao("Marcar como pago?", "O boleto vai para a aba 'Pago'.");
  if (!confirmado) return;
  const boleto = boletos.find((b) => b.id === id);
  boleto.pago = true;
  await salvarUmBoleto(boleto);
  renderTudo();
}

async function reabrirBoleto(id) {
  const confirmado = await confirmarAcao("Reabrir este boleto?", "Ele deixará de estar marcado como pago.");
  if (!confirmado) return;
  const boleto = boletos.find((b) => b.id === id);
  boleto.pago = false;
  await salvarUmBoleto(boleto);
  renderTudo();
}

// ====================================================
// VISUALIZAÇÃO DE ARQUIVO (boleto / comprovante)
// ====================================================
async function abrirArquivo(chave, titulo) {
  if (!chave) return;
  popupArquivoBody.innerHTML = "Carregando...";
  popupArquivo.style.display = "flex";
  try {
    const url = await urlDeVisualizacao(chave);
    popupArquivoBody.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = url;
    popupArquivoBody.appendChild(iframe);
  } catch (e) {
    popupArquivoBody.innerHTML = "Não foi possível carregar o arquivo.";
  }
}
function fecharPopupArquivoFn() {
  popupArquivo.style.display = "none";
  popupArquivoBody.innerHTML = "";
}
fecharPopupArquivo.addEventListener("click", fecharPopupArquivoFn);
btnFecharPopupArquivo.addEventListener("click", fecharPopupArquivoFn);
popupArquivo.addEventListener("click", (e) => {
  if (e.target === popupArquivo) fecharPopupArquivoFn();
});

// ====================================================
// FILTROS
// ====================================================
function popularFiltrosMesAno() {
  const todosComData = boletos.filter((b) => b.dataVencimento);
  const anos = [...new Set(todosComData.map((b) => new Date(b.dataVencimento + "T00:00:00").getFullYear()))].sort((a, b) => b - a);

  const mesAtual = filtroMes.value;
  filtroMes.innerHTML = '<option value="todos">Todos</option>';
  NOMES_MESES.forEach((nome, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = nome;
    filtroMes.appendChild(opt);
  });
  filtroMes.value = mesAtual || "todos";

  const anoAtual = filtroAno.value;
  filtroAno.innerHTML = '<option value="todos">Todos</option>';
  anos.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = String(ano);
    opt.textContent = ano;
    filtroAno.appendChild(opt);
  });
  filtroAno.value = anoAtual || "todos";
}

function aplicarFiltros() {
  const termo = buscaInput.value.trim().toLowerCase();
  const tipoSel = filtroTipo.value;
  const bancoSel = filtroBanco.value;
  const mesSel = filtroMes.value;
  const anoSel = filtroAno.value;

  return boletos.filter((b) => {
    const status = calcularStatus(b);
    const abaOK = abaAtiva === "todos" || status === abaAtiva;

    const buscaOK =
      termo === "" ||
      (b.nome || "").toLowerCase().includes(termo) ||
      (b.codigo || "").toLowerCase().includes(termo) ||
      (b.observacao || "").toLowerCase().includes(termo);

    const tipoOK = tipoSel === "todos" || b.tipo === tipoSel;
    const bancoOK = bancoSel === "todos" || b.banco === bancoSel;

    let mesAnoOK = true;
    if ((mesSel !== "todos" || anoSel !== "todos") && b.dataVencimento) {
      const data = new Date(b.dataVencimento + "T00:00:00");
      const mesOK = mesSel === "todos" || data.getMonth() === parseInt(mesSel, 10);
      const anoOK = anoSel === "todos" || data.getFullYear() === parseInt(anoSel, 10);
      mesAnoOK = mesOK && anoOK;
    } else if ((mesSel !== "todos" || anoSel !== "todos") && !b.dataVencimento) {
      mesAnoOK = false;
    }

    return abaOK && buscaOK && tipoOK && bancoOK && mesAnoOK;
  });
}

// ====================================================
// RENDERIZAÇÃO
// ====================================================
function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "—";
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatarDataBR(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function atualizarContadorAtrasados() {
  const totalAtrasados = boletos.filter((b) => calcularStatus(b) === "atrasado").length;
  if (totalAtrasados > 0) {
    contadorAtrasadosEl.textContent = totalAtrasados;
    contadorAtrasadosEl.style.display = "inline-block";
  } else {
    contadorAtrasadosEl.style.display = "none";
  }
}

function renderLista() {
  popularFiltrosMesAno();
  atualizarContadorAtrasados();

  const itens = aplicarFiltros().sort((a, b) => {
    if (!a.dataVencimento) return 1;
    if (!b.dataVencimento) return -1;
    return new Date(a.dataVencimento) - new Date(b.dataVencimento);
  });

  listaBoletosEl.innerHTML = "";

  if (itens.length === 0) {
    semResultadosEl.style.display = "block";
    return;
  }
  semResultadosEl.style.display = "none";

  itens.forEach((b) => {
    const status = calcularStatus(b);
    const card = document.createElement("div");
    card.className = `boleto-card cor-${status}`;

    const botoesArquivo = [];
    if (b.arquivoBoletoChave) {
      botoesArquivo.push(`<button class="btn-pdf" data-ver-boleto="${b.id}">Ver Boleto</button>`);
    }
    if (b.arquivoComprovanteChave) {
      botoesArquivo.push(`<button class="btn-pdf" data-ver-comprovante="${b.id}">Ver Comprovante</button>`);
    }

    const botaoStatus =
      status === "pago"
        ? `<button class="btn-reabrir" data-reabrir="${b.id}">Reabrir</button>`
        : `<button class="btn-pagar" data-pagar="${b.id}">Marcar como Pago</button>`;

    card.innerHTML = `
      <div class="boleto-topo">
        <div>
          <span class="boleto-nome">${escaparHtml(b.nome) || "(sem nome)"}</span>
          <span class="boleto-tag-tipo ${b.tipo}">${b.tipo === "despesa" ? "Despesa" : "Entrada"}</span>
          ${b.banco ? `<span class="boleto-tag-banco">${escaparHtml(b.banco)}</span>` : ""}
          ${b.loteId ? `<span class="boleto-tag-lote" title="Faz parte de uma leva de vários boletos">Leva</span>` : ""}
        </div>
        <span class="selo-status ${status}">${status === "pendente" ? "Pendente" : status === "atrasado" ? "Atrasado" : "Pago"}</span>
      </div>
      <div class="boleto-meta">
        <span>Código: ${escaparHtml(b.codigo) || "—"}</span>
        <span class="boleto-valor">${formatarMoeda(b.valor)}</span>
        <span>Cadastro: ${formatarDataBR(b.dataCadastro)}</span>
        <span>Vencimento: ${formatarDataBR(b.dataVencimento)}</span>
        <span><strong>${textoPrazo(b)}</strong></span>
      </div>
      ${b.observacao ? `<div class="boleto-observacao">${escaparHtml(b.observacao)}</div>` : ""}
      <div class="boleto-acoes">
        ${botoesArquivo.join("")}
        <button class="btn-editar" data-edit="${b.id}">Editar</button>
        ${botaoStatus}
        <button class="btn-excluir-item" data-delete="${b.id}">Excluir</button>
      </div>
    `;
    listaBoletosEl.appendChild(card);
  });

  listaBoletosEl.querySelectorAll("[data-ver-boleto]").forEach((btn) => {
    btn.addEventListener("click", () => abrirArquivo(boletos.find((b) => b.id === btn.dataset.verBoleto).arquivoBoletoChave, "Boleto"));
  });
  listaBoletosEl.querySelectorAll("[data-ver-comprovante]").forEach((btn) => {
    btn.addEventListener("click", () => abrirArquivo(boletos.find((b) => b.id === btn.dataset.verComprovante).arquivoComprovanteChave, "Comprovante"));
  });
  listaBoletosEl.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => editar(btn.dataset.edit));
  });
  listaBoletosEl.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => excluir(btn.dataset.delete));
  });
  listaBoletosEl.querySelectorAll("[data-pagar]").forEach((btn) => {
    btn.addEventListener("click", () => marcarComoPago(btn.dataset.pagar));
  });
  listaBoletosEl.querySelectorAll("[data-reabrir]").forEach((btn) => {
    btn.addEventListener("click", () => reabrirBoleto(btn.dataset.reabrir));
  });
}

function renderTudo() {
  renderLista();
}

// ====================================================
// ABAS DE STATUS
// ====================================================
abasStatus.forEach((aba) => {
  aba.addEventListener("click", () => {
    abasStatus.forEach((a) => a.classList.remove("active"));
    aba.classList.add("active");
    abaAtiva = aba.dataset.statusAba;
    renderLista();
  });
});

// ====================================================
// FILTROS — listeners
// ====================================================
buscaInput.addEventListener("input", renderLista);
filtroTipo.addEventListener("change", renderLista);
filtroBanco.addEventListener("change", renderLista);
filtroMes.addEventListener("change", renderLista);
filtroAno.addEventListener("change", renderLista);
btnLimparFiltros.addEventListener("click", () => {
  buscaInput.value = "";
  filtroTipo.value = "todos";
  filtroBanco.value = "todos";
  filtroMes.value = "todos";
  filtroAno.value = "todos";
  renderLista();
});

// ====================================================
// INICIALIZAÇÃO
// ====================================================
(async function inicializarBoletos() {
  definirTipoModal("despesa");
  definirModoQuantidade("um");
  adicionarLinhaLote();
  await carregarBoletos();
  renderTudo();
})();

// ── FNX DEV: as opções de "Conta" vêm do Gerenciamento de Contas ──
(async function preencherContasBoletos() {
  try {
    const r = await apiDataGet("contasBancarias");
    const contas = r.ok && Array.isArray(r.valor) ? r.valor : [];
    const nomes = contas.map((c) => c.nome);
    [campoBancoBoleto, filtroBanco].forEach((sel) => {
      if (!sel) return;
      const valorAtual = sel.value;
      nomes.forEach((n) => {
        if ([...sel.options].some((o) => o.value === n)) return;
        const o = document.createElement("option");
        o.value = n; o.textContent = n;
        sel.appendChild(o);
      });
      sel.value = valorAtual;
    });
  } catch (e) { /* sem contas: segue só com "Nenhum específico" */ }
})();
