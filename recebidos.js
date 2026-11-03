// ============================================================
// recebidos.js — registro de notas que fornecedores emitem
// para o CNPJ da FNX TECH (não é emissão, é organização/arquivo).
// ============================================================

const WORKER_URL_RECEBIDOS = FNX_API;

let recebidosCache = [];
let arquivoSelecionado = null;

// ── Upload de arquivo (reaproveita a mesma rota do Armazenamento) ──
function uploadArquivoRecebido(id, arquivo) {
  return new Promise((resolve, reject) => {
    const chave = `notas-recebidas/${id}_${arquivo.name}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL_RECEBIDOS}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(chave); else reject(new Error("Falha ao enviar o arquivo (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o arquivo"));
    xhr.send(arquivo);
  });
}

function urlArquivoRecebido(chave) {
  const token = pegarTokenDownloadCache();
  return `${WORKER_URL_RECEBIDOS}?action=get&key=${encodeURIComponent(chave)}&token=${encodeURIComponent(token)}`;
}

// ── Carregar / renderizar ─────────────────────────────────────
async function carregarRecebidos() {
  const resposta = await apiListarRecebidos();
  if (!resposta.ok) {
    mostrarToast(resposta.erro || "Não foi possível carregar as notas recebidas.", "erro");
    return;
  }
  recebidosCache = resposta.notas;
  renderizarLista();
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = dataIso.split("-");
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

function iconePorTipo(tipo) {
  if (tipo === "NF-e") return "📦";
  if (tipo === "NFS-e") return "🔧";
  return "📄";
}

function renderizarLista() {
  const busca = document.getElementById("buscaRecebidos").value.trim().toLowerCase();
  const filtroTipo = document.getElementById("filtroTipo").value;

  let filtrados = recebidosCache;
  if (filtroTipo) filtrados = filtrados.filter((n) => n.tipo === filtroTipo);
  if (busca) {
    filtrados = filtrados.filter((n) =>
      (n.fornecedorNome || "").toLowerCase().includes(busca) ||
      (n.numeroNota || "").toLowerCase().includes(busca) ||
      (n.descricao || "").toLowerCase().includes(busca) ||
      (n.fornecedorCnpj || "").toLowerCase().includes(busca)
    );
  }

  const lista = document.getElementById("listaRecebidos");
  const vazio = document.getElementById("vazioRecebidos");
  lista.innerHTML = "";

  if (filtrados.length === 0) {
    vazio.style.display = "block";
    return;
  }
  vazio.style.display = "none";

  filtrados.forEach((nota) => {
    const el = document.createElement("div");
    el.className = "item-recebido";

    const partesMeta = [];
    if (nota.numeroNota) partesMeta.push(`Nº ${escaparHtml(nota.numeroNota)}`);
    if (nota.fornecedorCnpj) partesMeta.push(escaparHtml(nota.fornecedorCnpj));
    if (nota.dataEmissao) partesMeta.push(formatarData(nota.dataEmissao));
    if (nota.descricao) partesMeta.push(escaparHtml(nota.descricao));

    el.innerHTML = `
      <div class="info-principal">
        <div class="icone-tipo">${iconePorTipo(nota.tipo)}</div>
        <div>
          <div class="nome-fornecedor">${escaparHtml(nota.fornecedorNome)}</div>
          <div class="meta">${nota.tipo} • ${partesMeta.join(" · ")}</div>
        </div>
      </div>
      <div class="valor">${formatarMoeda(nota.valor)}</div>
      <div class="acoes">
        ${nota.arquivoChave ? `<a href="${urlArquivoRecebido(nota.arquivoChave)}" target="_blank" rel="noopener">📎 Ver arquivo</a>` : ""}
        <button class="btn-excluir-recebido" data-id="${nota.id}">Excluir</button>
      </div>
    `;

    el.querySelector(".btn-excluir-recebido").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Mover a nota de "${nota.fornecedorNome}" pra lixeira?`, "Fica guardada na lixeira (junto com o Armazenamento) até você restaurar ou excluir definitivamente.");
      if (!ok) return;
      const resp = await apiExcluirRecebido(nota.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao mover pra lixeira.", "erro"); return; }
      mostrarToast("Movido para a lixeira.");
      carregarRecebidos();
    });

    lista.appendChild(el);
  });
}

// ── Lixeira ──────────────────────────────────────────────────
async function carregarLixeira() {
  const resposta = await apiListarLixeiraRecebidos();
  if (!resposta.ok) {
    mostrarToast(resposta.erro || "Não foi possível carregar a lixeira.", "erro");
    return;
  }
  renderizarLixeira(resposta.notas);
}

function renderizarLixeira(notas) {
  const lista = document.getElementById("listaLixeira");
  const vazio = document.getElementById("vazioLixeira");
  lista.innerHTML = "";

  if (notas.length === 0) {
    vazio.style.display = "block";
    return;
  }
  vazio.style.display = "none";

  notas.forEach((nota) => {
    const el = document.createElement("div");
    el.className = "item-recebido";

    const partesMeta = [];
    if (nota.numeroNota) partesMeta.push(`Nº ${escaparHtml(nota.numeroNota)}`);
    if (nota.excluidoEm) partesMeta.push("Excluído em " + new Date(nota.excluidoEm).toLocaleDateString("pt-BR"));

    el.innerHTML = `
      <div class="info-principal">
        <div class="icone-tipo">${iconePorTipo(nota.tipo)}</div>
        <div>
          <div class="nome-fornecedor">${escaparHtml(nota.fornecedorNome)}</div>
          <div class="meta">${nota.tipo} • ${partesMeta.join(" · ")}</div>
        </div>
      </div>
      <div class="valor">${formatarMoeda(nota.valor)}</div>
      <div class="acoes">
        ${nota.arquivoChave ? `<a href="${urlArquivoRecebido(nota.arquivoChave)}" target="_blank" rel="noopener">📎 Ver arquivo</a>` : ""}
        <button class="btn-restaurar-recebido">↩ Restaurar</button>
        <button class="btn-excluir-recebido">Excluir definitivo</button>
      </div>
    `;

    el.querySelector(".btn-restaurar-recebido").addEventListener("click", async () => {
      const resp = await apiRestaurarRecebido(nota.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao restaurar.", "erro"); return; }
      mostrarToast("Nota restaurada.");
      carregarLixeira();
    });

    el.querySelector(".btn-excluir-recebido").addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir definitivamente a nota de "${nota.fornecedorNome}"?`, "Isso apaga o arquivo de vez do Armazenamento. Não tem como desfazer.");
      if (!ok) return;
      const resp = await apiExcluirRecebidoDefinitivo(nota.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Excluído definitivamente.");
      carregarLixeira();
    });

    lista.appendChild(el);
  });
}

// ── Abas: Arquivos / Lixeira ──────────────────────────────────
document.getElementById("btnAbaArquivos").addEventListener("click", () => {
  document.getElementById("btnAbaArquivos").classList.add("active");
  document.getElementById("btnAbaLixeira").classList.remove("active");
  document.getElementById("painelArquivos").style.display = "block";
  document.getElementById("painelLixeira").style.display = "none";
});

document.getElementById("btnAbaLixeira").addEventListener("click", () => {
  document.getElementById("btnAbaLixeira").classList.add("active");
  document.getElementById("btnAbaArquivos").classList.remove("active");
  document.getElementById("painelArquivos").style.display = "none";
  document.getElementById("painelLixeira").style.display = "block";
  carregarLixeira();
});

// ── Formulário ────────────────────────────────────────────────
document.getElementById("campoArquivo").addEventListener("change", (e) => {
  arquivoSelecionado = e.target.files[0] || null;
  document.getElementById("nomeArquivoEscolhido").textContent = arquivoSelecionado ? arquivoSelecionado.name : "";
});

document.getElementById("formRecebido").addEventListener("submit", async (e) => {
  e.preventDefault();

  const tipo = document.getElementById("campoTipo").value;
  const fornecedorNome = document.getElementById("campoFornecedor").value.trim();
  const fornecedorCnpj = document.getElementById("campoCnpj").value.trim();
  const numeroNota = document.getElementById("campoNumero").value.trim();
  const valor = document.getElementById("campoValor").value;
  const dataEmissao = document.getElementById("campoData").value;
  const descricao = document.getElementById("campoDescricao").value.trim();

  if (!fornecedorNome) { mostrarToast("Informe o nome do fornecedor.", "erro"); return; }

  const botao = document.getElementById("btnSalvarRecebido");
  const textoOriginal = botao.textContent;
  botao.disabled = true;

  try {
    const id = String(Date.now());
    let arquivoChave = "";

    if (arquivoSelecionado) {
      botao.textContent = "Enviando arquivo...";
      arquivoChave = await uploadArquivoRecebido(id, arquivoSelecionado);
    }

    botao.textContent = "Salvando...";
    const resposta = await apiSalvarRecebido({
      id, tipo, fornecedorNome, fornecedorCnpj, numeroNota,
      valor: valor ? Number(valor) : null,
      dataEmissao, descricao, arquivoChave,
      criadoEm: Date.now(),
    });

    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar.", "erro"); return; }

    document.getElementById("formRecebido").reset();
    arquivoSelecionado = null;
    document.getElementById("nomeArquivoEscolhido").textContent = "";
    mostrarToast("Nota registrada.");
    carregarRecebidos();
  } catch (err) {
    mostrarToast(err.message || "Erro ao registrar a nota.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

document.getElementById("buscaRecebidos").addEventListener("input", renderizarLista);
document.getElementById("filtroTipo").addEventListener("change", renderizarLista);

garantirTokenDownload().then(carregarRecebidos);