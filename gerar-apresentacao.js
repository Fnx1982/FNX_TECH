// ============================================================
// gerar-apresentacao.js
// Monta a proposta comercial em PDF, no modelo padrão da FNX TECH,
// a partir de uma ou mais Propostas já cadastradas no sistema.
//
// Propostas ainda vivem no localStorage (não migradas pro
// servidor) — por isso lerPropostas() aqui é síncrona, sem await.
// ============================================================

const WORKER_URL_APRES = FNX_API;
let contadorBlocosProposta = 0;
let fotoLocalChave = null; // chave no R2, depois do upload
let apresentacaoIdAtual = null; // se veio de "Editar", o id do registro salvo

// ── Data padrão = hoje ────────────────────────────────────────
document.getElementById("campoDataDoc").value = new Date().toISOString().slice(0, 10);

// ── Texto de abertura padrão (igual ao modelo original) ───────
document.getElementById("campoTextoAbertura").value =
  "Nós da FNX TECH agradecemos o interesse em nossos serviços e oportunidade de enviar esta proposta comercial. " +
  "Com base nas suas solicitações, desenvolvemos uma proposta abrangente que aborda os assuntos mencionados e " +
  "busca atender às suas necessidades de forma eficaz.";

document.getElementById("campoTextoItem1").value =
  "1.1. Fornecimento de ART do Engenheiro responsável para obra junto ao CREA-PR;\n" +
  "Obs: Somente se necessário/solicitado para os serviços.\n\n" +
  "1.2. Aplicação de placa de identificação da obra em frente ao local com fácil visualização externa;\n\n" +
  "1.3. Informativos para atualizações e indicações relacionadas a execução e andamento da obra;\n\n" +
  "1.4. Fornecimento de cronograma com previsão de início e finalização;\n" +
  "Obs: Laudos Técnicos e documentações junto à Prefeitura e demais órgãos são custos de responsabilidade do cliente ou adicionais feita proposta separadamente.";

document.getElementById("campoTextoItem2").value =
  "2.1. Fornecimento de seguro da obra e de vida dos colaboradores no local de execução;\n\n" +
  "2.2. Lista dos colaboradores (nomes) que estiverem prestando serviços na execução da obra;\n\n" +
  "2.3. Cópia dos certificados NR's;\n" +
  "Obs: Apenas NR's necessárias para obra citada\n\n" +
  "2.4. Fornecimento de cópia PGR/PCMSO.";

document.getElementById("campoTextoItem3").value =
  "3.1. Isolamento de área para armazenamento dos materiais, equipamentos e ferramentas, necessário também ambiente separado para vestuário, banheiro e alimentação para os colaboradores envolvidos na obra em local indicado e disponibilizado pelo cliente;\n\n" +
  "3.2. Isolamento de áreas térreas com uso de placas sinalizadoras, fitas zebradas, tapumes, lonas, a fim de evitar acesso de pessoas não autorizadas em áreas da obra;\n\n" +
  "3.3. Utilização dos equipamentos de proteção individual aos colaboradores;\n\n" +
  "3.4. Utilização de caçambas próximas ao local de obra para descartes de resíduos gerados pela execução.";

document.getElementById("campoTextoConsideracoes").value =
  "Fornecimento de pontos de água, elétricos 110/220v e se necessário outros itens a serem verificados.\n\n" +
  "Disponibilização do escopo da área de trabalho livre para execução durante os serviços;\n\n" +
  "O Contratante/Cliente autoriza o uso de imagens, para registro do presente trabalho em execução e finalização sendo gratuitas as liberações delas para divulgações em redes sociais, portfólio, site, mídias digitais e folhetos e banners gerais.\n\n" +
  "Caso não seja liberado/autorizado o uso das imagens do local deve ser comunicado para o contratado e informado por escrito a não utilização até a finalização dos serviços e entrega.\n\n" +
  "- Deve ser liberada a entrada de prestadores e equipe para execução dos serviços juntamente com o Coordenador Técnico;\n" +
  "- No local deve ser retirado todo item que possa vir a atrapalhar área e desempenho, não nos responsabilizamos por itens que ficarem em local de execução após o aviso;\n" +
  "- O responsável pelo local deve informar os clientes/fornecedores/moradores sobre os serviços e pedir a colaboração até a finalização das execuções;\n" +
  "- Deverá ser alinhado para os serviços a liberação de algumas áreas para ocorrer as execuções no local.";

document.getElementById("campoTextoProximaEtapa").value =
  "Estamos à disposição para discutir quaisquer dúvidas ou ajustes necessários desta proposta enviada. Por favor, entre em contato conosco para agendar uma reunião ou para esclarecer qualquer questão adicional ou solicitar alterações.\n\n" +
  "Caso aprovada deve ser firmada entre as partes Contrato de prestação de serviços.";

// ── Datalist de clientes, a partir das propostas já cadastradas ──
function popularClientesApresDatalist() {
  const nomes = [...new Set(lerPropostas().map((p) => p.cliente).filter(Boolean))];
  document.getElementById("listaClientesApresDatalist").innerHTML =
    nomes.map((n) => `<option value="${escaparHtml(n)}"></option>`).join("");
}
popularClientesApresDatalist();

// ── Upload da foto do local (círculo da página 3) ──────────────
function uploadFotoLocalApres(arquivo) {
  return new Promise((resolve, reject) => {
    const chave = `apresentacoes/${Date.now()}_${arquivo.name}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL_APRES}?action=put&key=${encodeURIComponent(chave)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onload = () => { if (xhr.status < 300) resolve(chave); else reject(new Error("Falha ao enviar foto (" + xhr.status + ")")); };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar foto"));
    xhr.send(arquivo);
  });
}

document.getElementById("campoFotoLocal").addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;

  // Prévia local imediata (não precisa esperar o upload pra já mostrar)
  const leitor = new FileReader();
  leitor.onload = () => {
    document.getElementById("fotoLocalImg").src = leitor.result;
    document.getElementById("fotoLocalImg").style.display = "block";
    document.getElementById("fotoLocalPlaceholder").style.display = "none";
    document.getElementById("btnRemoverFotoLocal").style.display = "inline-block";
  };
  leitor.readAsDataURL(arquivo);

  try {
    fotoLocalChave = await uploadFotoLocalApres(arquivo);
  } catch (err) {
    mostrarToast(err.message || "Erro ao enviar a foto.", "erro");
  }
});

document.getElementById("btnRemoverFotoLocal").addEventListener("click", () => {
  fotoLocalChave = null;
  document.getElementById("campoFotoLocal").value = "";
  document.getElementById("fotoLocalImg").style.display = "none";
  document.getElementById("fotoLocalPlaceholder").style.display = "block";
  document.getElementById("btnRemoverFotoLocal").style.display = "none";
});

// ── Blocos de proposta anexada (repetível, sem limite) ─────────
function renumerarBlocosProposta() {
  document.querySelectorAll(".bloco-proposta-anexada").forEach((bloco, i) => {
    bloco.querySelector(".bloco-proposta-numero").textContent = `${i + 1}° Serviço`;
  });
}

function atualizarPreviewProposta(bloco, proposta) {
  const preview = bloco.querySelector(".preview-itens-proposta");
  if (!proposta) { preview.classList.remove("visivel"); preview.innerHTML = ""; return; }

  const mo = totalMaoDeObra(proposta);
  const mat = totalMateriais(proposta);
  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (t) => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t || ""));
  const itens = [
    ...(proposta.itensMaoDeObra || []).map((i) => ({ tipo: "Serviço", nome: i.descricao, valor: valorFinalItemApres(i) })),
    ...(proposta.itensMateriais || []).map((i) => ({ tipo: "Material", nome: i.nome, valor: valorFinalItemApres(i) })),
  ].filter((i) => (i.nome || "").trim());
  const mostrar = itens.slice(0, 5);
  const chips = [
    proposta.planejamentoDias ? `⏱ ${proposta.planejamentoDias} dias úteis` : "",
    proposta.validadeDias ? `📅 válida ${proposta.validadeDias} dias` : "",
    proposta.entradaPerc ? `💳 entrada ${proposta.entradaPerc}%` : "",
    proposta.parcelas ? `🔁 ${proposta.parcelas}x` : "",
  ].filter(Boolean);

  preview.innerHTML = `
    <div class="pv-topo">
      <div>
        <div class="pv-numero">Orçamento ${proposta.numeroOrcamento ? "nº " + esc(proposta.numeroOrcamento) : ""}</div>
        <div class="pv-cliente">${esc(proposta.cliente || "(sem cliente)")}</div>
        ${proposta.local ? `<div class="pv-endereco">📍 ${esc(proposta.local)}</div>` : ""}
      </div>
      <span class="pv-status">${esc(typeof rotuloStatus === "function" ? rotuloStatus(proposta) : "")}</span>
    </div>
    <div class="pv-tiles">
      <div class="pv-tile"><span>Serviços</span><b>${fmt(mo)}</b><small>${(proposta.itensMaoDeObra || []).length} item(ns)</small></div>
      <div class="pv-tile"><span>Materiais</span><b>${fmt(mat)}</b><small>${(proposta.itensMateriais || []).length} item(ns)</small></div>
      <div class="pv-tile pv-total"><span>Total</span><b>${fmt(mo + mat)}</b><small>vai assim no PDF</small></div>
    </div>
    ${mostrar.length ? `<ul class="pv-itens">${mostrar.map((i) => `<li><span class="pv-tipo ${i.tipo === "Serviço" ? "srv" : "mat"}">${i.tipo}</span><span class="pv-nome">${esc(i.nome)}</span><span class="pv-valor">${fmt(i.valor)}</span></li>`).join("")}</ul>
      ${itens.length > mostrar.length ? `<div class="pv-mais">+ ${itens.length - mostrar.length} item(ns)</div>` : ""}` : ""}
    ${chips.length ? `<div class="pv-chips">${chips.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}
  `;
  preview.classList.add("visivel");
}

// Lista de orçamentos no seletor. Os orçamentos chegam do servidor
// depois que a página abre — por isso a lista é refeita quando eles
// chegam (antes, num aparelho novo, o seletor ficava vazio).
function preencherSelectPropostasApres(select) {
  const atual = select.value;
  select.querySelectorAll("option:not([value=''])").forEach((o) => o.remove());
  lerPropostas()
    .slice().sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.numeroOrcamento ? "Nº " + p.numeroOrcamento + " — " : ""}${p.cliente || "(sem cliente)"} — ${p.servico || "(sem serviço)"}`;
      select.appendChild(opt);
    });
  select.value = atual;
}
document.addEventListener("propostas-carregadas", () => {
  document.querySelectorAll(".campo-select-proposta-existente").forEach(preencherSelectPropostasApres);
});

function criarBlocoProposta() {
  const template = document.getElementById("templateBlocoProposta");
  const clone = template.content.cloneNode(true);
  const bloco = clone.querySelector(".bloco-proposta-anexada");
  const id = ++contadorBlocosProposta;
  bloco.dataset.blocoId = id;

  const selectExistente = bloco.querySelector(".campo-select-proposta-existente");
  preencherSelectPropostasApres(selectExistente);

  selectExistente.addEventListener("change", () => {
    const proposta = buscarProposta(selectExistente.value);
    const campoNomeServico = bloco.querySelector(".campo-nome-servico-anexado");
    const campoFormaPagamento = bloco.querySelector(".campo-forma-pagamento-anexada");
    const campoProgramacao = bloco.querySelector(".campo-programacao-anexada");

    if (proposta) {
      if (!campoNomeServico.value.trim()) campoNomeServico.value = proposta.servico || "";
      if (!campoFormaPagamento.value.trim()) {
        const txtPag = typeof linhasCondicaoPagamento === "function" ? linhasCondicaoPagamento(proposta, true).join(" ") : proposta.formaPagamento;
        if (txtPag) campoFormaPagamento.value = txtPag;
      }
      if (proposta.planejamentoDias && !campoProgramacao.value.trim()) campoProgramacao.value = `${proposta.planejamentoDias} dias úteis`;

      // Se o nome do cliente lá em cima ainda estiver vazio, aproveita
      // e preenche com o cliente dessa proposta — nunca sobrescreve o
      // que a pessoa já tiver digitado.
      const campoClienteTopo = document.getElementById("campoNomeClienteApres");
      if (!campoClienteTopo.value.trim() && proposta.cliente) campoClienteTopo.value = proposta.cliente;
      // Nome do local (condomínio/empresa) que veio da agenda → visita → orçamento
      const campoLocalTopo = document.getElementById("campoNomeLocalApres");
      if (campoLocalTopo && !campoLocalTopo.value.trim() && proposta.localDescricao) campoLocalTopo.value = proposta.localDescricao;
    }
    atualizarPreviewProposta(bloco, proposta);
  });

  bloco.querySelector(".btn-remover-bloco-proposta").addEventListener("click", async () => {
    const ok = await confirmarAcao("Remover este serviço da apresentação?", "");
    if (!ok) return;
    bloco.remove();
    renumerarBlocosProposta();
  });

  document.getElementById("listaPropostasAnexadas").appendChild(bloco);
  renumerarBlocosProposta();
}

document.getElementById("btnAdicionarPropostaApres").addEventListener("click", criarBlocoProposta);

// Começa já com um bloco, pra não obrigar a pessoa a clicar antes de
// conseguir preencher a primeira proposta.
criarBlocoProposta();

// ====================================================
// NAVEGAÇÃO ENTRE ETAPAS
// ====================================================
let etapaAtual = 1;
const TOTAL_ETAPAS = 4;

function irParaEtapa(n) {
  etapaAtual = n;

  document.querySelectorAll(".etapa-conteudo").forEach((el) => {
    el.style.display = parseInt(el.dataset.etapaConteudo, 10) === n ? "" : "none";
  });

  document.querySelectorAll(".etapa-pill").forEach((pill) => {
    const num = parseInt(pill.dataset.etapa, 10);
    pill.classList.toggle("active", num === n);
    pill.classList.toggle("concluida", num < n);
  });

  document.getElementById("btnEtapaVoltar").style.visibility = n === 1 ? "hidden" : "visible";
  const btnAvancar = document.getElementById("btnEtapaAvancar");
  btnAvancar.style.display = n === TOTAL_ETAPAS ? "none" : "";

  if (n === 4) renderResumoRevisao();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Validação leve antes de avançar — só o essencial pra não deixar
// passar sem o mínimo, sem travar a pessoa em detalhes.
function validarEtapaAtual() {
  if (etapaAtual === 1) {
    const campo = document.getElementById("campoNomeClienteApres");
    if (!campo.value.trim()) {
      marcarCampoComErro(campo, "Informe o nome do cliente.");
      campo.focus();
      return false;
    }
    limparErroCampo(campo);
  }
  if (etapaAtual === 3) {
    const blocos = document.querySelectorAll(".bloco-proposta-anexada");
    if (blocos.length === 0) {
      mostrarToast("Adicione pelo menos um serviço/proposta.", "erro");
      return false;
    }
  }
  return true;
}

document.getElementById("btnEtapaAvancar").addEventListener("click", () => {
  if (!validarEtapaAtual()) return;
  if (etapaAtual < TOTAL_ETAPAS) irParaEtapa(etapaAtual + 1);
});
document.getElementById("btnEtapaVoltar").addEventListener("click", () => {
  if (etapaAtual > 1) irParaEtapa(etapaAtual - 1);
});
document.querySelectorAll(".etapa-pill").forEach((pill) => {
  pill.addEventListener("click", () => irParaEtapa(parseInt(pill.dataset.etapa, 10)));
});

function renderResumoRevisao() {
  const dados = coletarDadosApresentacao();
  const container = document.getElementById("resumoRevisaoApres");
  container.innerHTML = `
    <div class="linha-resumo"><span>Cliente</span><strong>${escaparHtml(dados.nomeCliente) || "—"}</strong></div>
    <div class="linha-resumo"><span>N° do documento</span><strong>${escaparHtml(dados.numeroDocumento) || "—"}</strong></div>
    <div class="linha-resumo"><span>Data</span><strong>${dados.data ? new Date(dados.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</strong></div>
    <div class="linha-resumo"><span>Foto do local</span><strong>${dados.fotoLocalChave ? "Anexada" : "Sem foto"}</strong></div>
    <div class="linha-resumo"><span>Serviços anexados</span><strong>${dados.propostasAnexadas.length}</strong></div>
    ${dados.propostasAnexadas.map((p, i) => `<div class="linha-resumo" style="padding-left:16px;"><span>${i + 1}° — ${escaparHtml(p.nomeServico) || "(sem nome)"}</span><span></span></div>`).join("")}
  `;

  const campoNomeArquivo = document.getElementById("campoNomeArquivoApres");
  if (!campoNomeArquivo.value.trim() && dados.nomeCliente) {
    campoNomeArquivo.value = `Proposta_${dados.nomeCliente.replace(/\s+/g, "_")}_${dados.numeroDocumento || new Date().toISOString().slice(0, 10)}`;
  }
}

irParaEtapa(1);

// ── Coleta tudo do formulário num objeto só, pronto pra virar PDF ──
function coletarDadosApresentacao() {
  const propostasAnexadas = [...document.querySelectorAll(".bloco-proposta-anexada")].map((bloco) => {
    const propostaId = bloco.querySelector(".campo-select-proposta-existente").value;
    return {
      propostaId: propostaId || null,
      proposta: propostaId ? buscarProposta(propostaId) : null,
      nomeServico: bloco.querySelector(".campo-nome-servico-anexado").value.trim(),
      formaPagamento: bloco.querySelector(".campo-forma-pagamento-anexada").value.trim(),
      programacao: bloco.querySelector(".campo-programacao-anexada").value.trim(),
    };
  });

  return {
    nomeCliente: document.getElementById("campoNomeClienteApres").value.trim(),
    numeroDocumento: document.getElementById("campoNumeroDoc").value.trim(),
    data: document.getElementById("campoDataDoc").value,
    nomeLocal: document.getElementById("campoNomeLocalApres").value.trim(),
    fotoLocalChave,
    anosExperiencia: document.getElementById("campoAnosExperiencia").value,
    textoAbertura: document.getElementById("campoTextoAbertura").value.trim(),
    textoItem1: document.getElementById("campoTextoItem1").value.trim(),
    textoItem2: document.getElementById("campoTextoItem2").value.trim(),
    textoItem3: document.getElementById("campoTextoItem3").value.trim(),
    garantiaNumero: document.getElementById("campoGarantiaNumero").value,
    garantiaUnidade: document.getElementById("campoGarantiaUnidade").value,
    validadeDias: document.getElementById("campoValidadeDias").value,
    textoConsideracoes: document.getElementById("campoTextoConsideracoes").value.trim(),
    observacoesFinais: document.getElementById("campoObservacoesFinais").value.trim(),
    textoProximaEtapa: document.getElementById("campoTextoProximaEtapa").value.trim(),
    propostasAnexadas,
  };
}

document.getElementById("btnGerarPdfApresentacao").addEventListener("click", () => {
  const dados = coletarDadosApresentacao();
  if (!dados.nomeCliente) {
    mostrarToast("Informe o nome do cliente.", "erro");
    return;
  }
  if (dados.propostasAnexadas.length === 0) {
    mostrarToast("Adicione pelo menos um serviço/proposta.", "erro");
    return;
  }
  gerarPdfApresentacao(dados);
});

// Converte número em extenso (0–999), pra frase "garantia de XX (extenso) dias".
function numeroPorExtenso(n) {
  n = parseInt(n, 10) || 0;
  if (n === 0) return "zero";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dez_dezenove = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function ate99(v) {
    if (v < 10) return unidades[v];
    if (v < 20) return dez_dezenove[v - 10];
    const d = Math.floor(v / 10), u = v % 10;
    return dezenas[d] + (u ? " e " + unidades[u] : "");
  }
  function ate999(v) {
    if (v === 100) return "cem";
    const c = Math.floor(v / 100), resto = v % 100;
    let s = centenas[c];
    if (resto) s += (s ? " e " : "") + ate99(resto);
    return s;
  }
  return ate999(n);
}

function formatarMoedaApres(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Réplica local e mínima do valorFinalItem de propostas-form.js —
// não carrego aquele arquivo inteiro aqui só por causa desta conta,
// pra não puxar código que espera elementos de tela que não existem
// nesta página (o modal de Orçamento).
function valorFinalItemApres(item) {
  if (item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "") {
    return parseFloat(item.valorFinal) || 0;
  }
  return (parseFloat(item.qtd) || 0) * (parseFloat(item.valorUnit) || 0);
}
function totalListaApres(lista) {
  return (lista || []).reduce((s, item) => s + valorFinalItemApres(item), 0);
}

// Recorta uma imagem em círculo, usando um <canvas> como intermediário
// (jsPDF não recorta imagem em formas nativamente). Devolve uma data
// URL em PNG com cantos transparentes fora do círculo.
function recortarImagemEmCirculo(imgElement, tamanhoPx) {
  const canvas = document.createElement("canvas");
  canvas.width = tamanhoPx;
  canvas.height = tamanhoPx;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.beginPath();
  ctx.arc(tamanhoPx / 2, tamanhoPx / 2, tamanhoPx / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Desenha a imagem "cobrindo" o quadrado (igual object-fit: cover),
  // sem esticar/distorcer.
  const escala = Math.max(tamanhoPx / imgElement.naturalWidth, tamanhoPx / imgElement.naturalHeight);
  const larguraDesenho = imgElement.naturalWidth * escala;
  const alturaDesenho = imgElement.naturalHeight * escala;
  ctx.drawImage(imgElement, (tamanhoPx - larguraDesenho) / 2, (tamanhoPx - alturaDesenho) / 2, larguraDesenho, alturaDesenho);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

async function gerarPdfApresentacao(dados) {
  const botao = document.getElementById("btnGerarPdfApresentacao");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Gerando PDF...";

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 50, MR = 50;
    let y = 0;

    // Visual limpo, sem barras coloridas — texto preto, títulos em
    // negrito com uma linha fina embaixo, no estilo do modelo original.
    const PRETO = [20, 20, 20];
    const CINZA_LINHA = [200, 200, 200];
    const LARANJA = [255, 106, 0]; // só pras tabelas de proposta — o resto do doc fica no visual clean

    function novaPagina() {
      doc.addPage();
      y = 50;
    }
    function garantirEspaco(min) {
      if (y + min > PH - 55) novaPagina();
    }
    function tituloSecao(texto) {
      garantirEspaco(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const larguraTexto = doc.getTextWidth(texto);
      const padH = 14;
      const alturaPilula = 22;
      const larguraPilula = larguraTexto + padH * 2;
      doc.setFillColor(20, 20, 20);
      doc.roundedRect(ML, y, larguraPilula, alturaPilula, alturaPilula / 2, alturaPilula / 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(texto, ML + padH, y + alturaPilula / 2 + 4);
      y += alturaPilula + 14;
      doc.setTextColor(0);
    }
    function paragrafo(texto, opcoes) {
      opcoes = opcoes || {};
      doc.setFont("helvetica", opcoes.negrito ? "bold" : "normal");
      doc.setFontSize(opcoes.tamanho || 10.5);
      doc.setTextColor(0);
      const larguraTexto = opcoes.largura || (PW - ML - MR);
      const linhas = doc.splitTextToSize(texto, larguraTexto);
      linhas.forEach((linha) => {
        garantirEspaco(16);
        doc.text(linha, opcoes.x || ML, y);
        y += 14;
      });
      y += opcoes.espacoDepois !== undefined ? opcoes.espacoDepois : 8;
    }
    function rodape() {
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text([FNX_EMPRESA.nome, [FNX_EMPRESA.endereco, FNX_EMPRESA.cidade].filter(Boolean).join(", "), FNX_EMPRESA.email].filter(Boolean).join(" — "), PW / 2, PH - 20, { align: "center" });
        doc.text(`${i} | Página`, PW - MR, PH - 20, { align: "right" });
        doc.setTextColor(0);
      }
    }


    // ── Orçamento dentro da apresentação: cartão com cabeçalho escuro,
    // dados do cliente em duas colunas, uma tabela só com Tipo
    // (Serviço/Material), totais em três blocos e um quadro de
    // observações gerais (prazo, início, validade). ──────────────
    function desenharOrcamentoNaApresentacao(p, item) {
      const W = PW - ML - MR;
      const ESC = [38, 38, 38];
      const CINZA_TXT = [110, 110, 110];
      garantirEspaco(120);

      // Cabeçalho do cartão
      doc.setFillColor(...ESC);
      doc.roundedRect(ML, y, W, 46, 6, 6, "F");
      doc.setFillColor(...LARANJA);
      doc.rect(ML, y + 40, W, 6, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Orçamento ${p.numeroOrcamento ? "nº " + p.numeroOrcamento : ""}`.trim(), ML + 16, y + 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const dataOrc = new Date(p.criadoEm || Date.now()).toLocaleDateString("pt-BR");
      doc.text(`Emitido em ${dataOrc}`, ML + W - 16, y + 20, { align: "right" });
      if (typeof nomeResponsavelProposta === "function" && nomeResponsavelProposta(p)) {
        doc.text(`Responsável: ${nomeResponsavelProposta(p)}`, ML + W - 16, y + 32, { align: "right" });
      }
      doc.setTextColor(0);
      y += 60;

      // Dados do cliente (duas colunas)
      const pares = [
        ["CLIENTE", p.cliente], ["TELEFONE", p.telefone],
        ["ENDEREÇO", p.local], ["LOCAL", p.localDescricao],
      ].filter(([, v]) => (v || "").trim());
      const colW = W / 2;
      for (let i = 0; i < pares.length; i += 2) {
        garantirEspaco(30);
        [pares[i], pares[i + 1]].forEach((par, j) => {
          if (!par) return;
          const x = ML + j * colW;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...CINZA_TXT);
          doc.text(par[0], x, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0);
          doc.text(doc.splitTextToSize(String(par[1]), colW - 12)[0], x, y + 12);
        });
        y += 28;
      }
      if ((p.servico || "").trim()) {
        garantirEspaco(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...CINZA_TXT);
        doc.text("SERVIÇO", ML, y);
        doc.setTextColor(0);
        y += 12;
        paragrafo(p.servico, { tamanho: 10, espacoDepois: 6 });
      }

      // Tabela única: serviços e materiais
      const fmt = (v) => formatarMoedaApres(v);
      const corpo = [];
      (p.itensMaoDeObra || []).forEach((it) => corpo.push(["Serviço", it.descricao || "", it.unid || "", String(it.qtd || "").replace(".", ","),
        it.valorUnit ? fmt(Number(it.valorUnit)) : "-", fmt(valorFinalItemApres(it))]));
      (p.itensMateriais || []).forEach((it) => corpo.push(["Material", it.nome || "", it.unid || "", String(it.qtd || "").replace(".", ","),
        it.valorUnit ? fmt(Number(it.valorUnit)) : "-", fmt(valorFinalItemApres(it))]));
      if (corpo.length) {
        doc.autoTable({
          startY: y,
          head: [["Tipo", "Descrição", "Unid.", "Qtd", "Valor Unit.", "Total"]],
          body: corpo,
          margin: { left: ML, right: MR },
          styles: { fontSize: 8.5, cellPadding: 5, lineColor: [235, 235, 235], lineWidth: 0.5, textColor: [30, 30, 30] },
          headStyles: { fillColor: ESC, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [250, 247, 242] },
          columnStyles: { 0: { cellWidth: 52, fontStyle: "bold" }, 2: { cellWidth: 38, halign: "center" }, 3: { cellWidth: 34, halign: "center" },
            4: { cellWidth: 70, halign: "right" }, 5: { cellWidth: 76, halign: "right" } },
          didParseCell: (d) => {
            if (d.section === "body" && d.column.index === 0) {
              d.cell.styles.textColor = d.cell.raw === "Serviço" ? [180, 110, 10] : [43, 108, 176];
            }
          },
          theme: "grid",
        });
        y = doc.lastAutoTable.finalY + 14;
      }

      // Totais em três blocos
      const temCore = typeof totalMaoDeObra === "function";
      const tMO = temCore ? totalMaoDeObra(p) : totalListaApres(p.itensMaoDeObra);
      const tMat = temCore ? totalMateriais(p) : totalListaApres(p.itensMateriais);
      const desc = temCore ? descontoMaoDeObra(p) + descontoMateriais(p) : 0;
      garantirEspaco(70);
      const gap = 10;
      const tileW = (W - gap * 2) / 3;
      const tiles = [["Serviços", tMO, false], ["Materiais", tMat, false], ["Total", tMO + tMat, true]];
      tiles.forEach(([rot, val, destaque], i) => {
        const x = ML + i * (tileW + gap);
        if (destaque) doc.setFillColor(...LARANJA); else doc.setFillColor(246, 246, 246);
        doc.roundedRect(x, y, tileW, 48, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...(destaque ? [255, 255, 255] : CINZA_TXT));
        doc.text(rot.toUpperCase(), x + 12, y + 16);
        doc.setFontSize(destaque ? 15 : 13);
        doc.setTextColor(...(destaque ? [255, 255, 255] : [30, 30, 30]));
        doc.text(fmt(val), x + 12, y + 36);
      });
      doc.setTextColor(0);
      y += 58;
      if (desc > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(176, 58, 46);
        doc.text(`Desconto já aplicado: ${fmt(desc)}`, ML + W, y, { align: "right" });
        doc.setTextColor(0);
        y += 14;
      }

      // Observações gerais
      const obs = [];
      if (p.planejamentoDias || item.programacao) obs.push(`Prazo de execução: ${item.programacao || p.planejamentoDias + " dias úteis"}.`);
      obs.push("Início após formalização de contrato e assinatura.");
      if (p.validadeDias) obs.push(`Proposta válida por ${p.validadeDias} dias.`);
      if ((p.observacao || "").trim()) obs.push(p.observacao.trim());
      const linhasObs = obs.flatMap((t) => doc.splitTextToSize(t, W - 28));
      const altObs = 30 + linhasObs.length * 12;
      garantirEspaco(altObs + 10);
      doc.setFillColor(255, 247, 234);
      doc.setDrawColor(...LARANJA);
      doc.setLineWidth(0.8);
      doc.roundedRect(ML, y, W, altObs, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(160, 95, 5);
      doc.text("Observações gerais", ML + 14, y + 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60);
      linhasObs.forEach((l, i) => doc.text(l, ML + 14, y + 32 + i * 12));
      doc.setTextColor(0);
      y += altObs + 16;
    }

    // ── Página 1: Capa ──────────────────────────────────────────
    // Logo redondo grande, centralizado, igual ao modelo original.
    try {
      const tamanhoLogo = 495; // quase a largura útil inteira da página (ML/MR = 50 cada lado)
      if (LOGO_REDONDO_EMPRESA_BASE64) doc.addImage(LOGO_REDONDO_EMPRESA_BASE64, "PNG", (PW - tamanhoLogo) / 2, 40, tamanhoLogo, tamanhoLogo);
    } catch (e) {
      console.warn("[gerar-apresentacao] Não foi possível desenhar a logo redonda da capa:", e);
    }

    // ── Página 2: Quem somos / Os serviços ───────────────────────
    novaPagina();
    tituloSecao("Quem somos");
    const anos = parseInt(dados.anosExperiencia, 10) || 0;
    paragrafo(`A FNX TECH soma ${anos} anos de experiência entregando soluções com foco em qualidade, eficiência, segurança e inovação.`, { espacoDepois: 10 });
    paragrafo("Contamos com uma equipe qualificada e experiente, aliada a práticas inovadoras que garantem agilidade, organização e cumprimento dos prazos. Valorizamos relações transparentes e personalizadas, oferecendo soluções que atendem às necessidades de cada cliente e agregam valor ao seu investimento. Conheça a FNX TECH.", { espacoDepois: 18 });

    tituloSecao("Os serviços");
    paragrafo("Oferecemos uma ampla gama de serviços em construção, reformas e manutenções para Condomínios, Indústrias, Residências e Instituições de ensino e religiosas, com soluções personalizadas para cada cliente.", { espacoDepois: 10 });
    paragrafo("Contamos também com planos de Manutenção Predial e Industrial, incluindo atendimento emergencial em qualquer horário.", { espacoDepois: 16 });

    // Lista de serviços (switches) + Planos (medalhas), desenhados
    // peça por peça a partir de recortes individuais — mais confiável
    // que uma imagem única (sem fundo/marca d'água atrapalhando).
    try {
      const xEsquerda = ML;
      const larguraToggles = 190;

      // Duas imagens de switches, empilhadas (a primeira tem 6 linhas,
      // a segunda tem as 3 últimas) — cada uma mantém sua proporção
      // original, só a largura é fixada.
      const altToggles1 = larguraToggles * (366 / 255);
      const altToggles2 = larguraToggles * (178 / 244);
      const alturaColunaEsquerda = altToggles1 + 8 + altToggles2;

      const xDireita = ML + larguraToggles + 40;
      const larguraMedalha = 34;
      const alturasMedalhas = { ouro: larguraMedalha * (107 / 67), prata: larguraMedalha * (97 / 70), bronze: larguraMedalha * (108 / 64) };
      const alturaColunaDireita = 26 + (alturasMedalhas.ouro + 14) + (alturasMedalhas.prata + 14) + alturasMedalhas.bronze;

      const alturaTotalSecao = Math.max(alturaColunaEsquerda, alturaColunaDireita) + 10;
      if (y + alturaTotalSecao > PH - 55) novaPagina();

      const yInicioSecao = y;
      doc.addImage(IMG_TOGGLES_1_BASE64, "PNG", xEsquerda, y, larguraToggles, altToggles1);
      doc.addImage(IMG_TOGGLES_2_BASE64, "PNG", xEsquerda, y + altToggles1 + 8, larguraToggles, altToggles2);

      let yMedalha = yInicioSecao + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...PRETO);
      doc.text("Planos", xDireita, yMedalha + 10);
      yMedalha += 26;

      const linhaPlano = (imgBase64, altura, rotulo) => {
        doc.addImage(imgBase64, "PNG", xDireita, yMedalha, larguraMedalha, altura);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(11);
        doc.setTextColor(180, 30, 30);
        doc.text(rotulo, xDireita + larguraMedalha + 12, yMedalha + altura / 2 + 4);
        doc.setTextColor(0);
        yMedalha += altura + 14;
      };
      linhaPlano(IMG_MEDALHA_OURO_BASE64, alturasMedalhas.ouro, "Plano Ouro");
      linhaPlano(IMG_MEDALHA_PRATA_BASE64, alturasMedalhas.prata, "Plano Prata");
      linhaPlano(IMG_MEDALHA_BRONZE_BASE64, alturasMedalhas.bronze, "Plano Bronze");

      y = yInicioSecao + Math.max(alturaColunaEsquerda, alturaColunaDireita) + 10;
    } catch (e) {
      console.warn("[gerar-apresentacao] Não foi possível desenhar serviços/planos:", e);
    }

    // ── Proposta Técnica ──────────────────────────────────────
    novaPagina();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PRETO);
    doc.text(`N° ${dados.numeroDocumento || "—"}`, ML, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const dataFmt = dados.data ? new Date(dados.data + "T12:00:00").toLocaleDateString("pt-BR") : "—";
    doc.text(`${FNX_EMPRESA.cidade ? FNX_EMPRESA.cidade + ", " : ""}${dataFmt}`, ML, y + 14);
    doc.setTextColor(0);

    // Foto do local: fica reservada no canto superior direito, num
    // espaço PRÓPRIO — o texto só começa DEPOIS dela (embaixo), nunca
    // ao lado, pra nunca ficar por cima da escrita.
    const imgLocalEl = document.getElementById("fotoLocalImg");
    let yAposFoto = y;
    if (imgLocalEl.src && imgLocalEl.src.startsWith("data:")) {
      try {
        const tamanhoFoto = 100;
        const fotoRedonda = recortarImagemEmCirculo(imgLocalEl, 300); // recorta em resolução maior, redimensiona no PDF
        doc.addImage(fotoRedonda, "PNG", PW - MR - tamanhoFoto, y - 10, tamanhoFoto, tamanhoFoto);
        yAposFoto = y - 10 + tamanhoFoto + 12;
      } catch (e) {
        console.warn("[gerar-apresentacao] Não foi possível desenhar a foto do local no PDF:", e);
      }
    }
    y += 30;
    if (dados.nomeLocal) { paragrafo(dados.nomeLocal, { negrito: true }); }
    paragrafo(`Prezado(a) ${dados.nomeCliente},`, { negrito: true, espacoDepois: 12 });
    // Garante que o texto que vem a seguir só começa depois do fim da
    // foto, mesmo que o parágrafo acima tenha terminado mais cedo.
    if (y < yAposFoto) y = yAposFoto;

    if (dados.textoAbertura) paragrafo(dados.textoAbertura);
    paragrafo("Nós da FNX TECH agradecemos o interesse em nossos serviços e oportunidade de enviar esta proposta comercial. Com base nas suas solicitações, desenvolvemos uma proposta abrangente que aborda os assuntos mencionados e busca atender às suas necessidades de forma eficaz.", { espacoDepois: 14 });

    tituloSecao("1. Início");
    if (dados.textoItem1) paragrafo(dados.textoItem1, { espacoDepois: 14 });

    tituloSecao("2. Fornecimentos de Documentações pela FNX TECH");
    if (dados.textoItem2) paragrafo(dados.textoItem2, { espacoDepois: 14 });

    tituloSecao("3. Isolamentos e Proteções");
    if (dados.textoItem3) paragrafo(dados.textoItem3, { espacoDepois: 14 });

    // ── Galeria de fotos (portfólio da empresa) ──────────────────
    // Uma única imagem, recortada fiel ao mosaico do modelo original
    // (em vez de tentar remontar 15 fotos separadas com posições
    // aproximadas) — garante o mesmo visual do Word, sem ficar
    // "quase igual". Mantém a proporção original da imagem, só
    // ajusta a largura pra caber na página.
    const LARGURA_MOSAICO = PW - ML - MR;
    const ALTURA_MOSAICO = LARGURA_MOSAICO * (1081 / 1463); // proporção real do recorte
    const alturaTotalGaleria = 36 + ALTURA_MOSAICO; // pílula do título (22+14) + imagem
    // Cabe inteira na página atual? Se não, pula pra uma nova AGORA
    // (antes do título), em vez de deixar meio numa e meio na outra.
    if (y + alturaTotalGaleria > PH - 55) novaPagina();

    tituloSecao("Nossos trabalhos");
    try {
      if (MOSAICO_FOTOS_EMPRESA) doc.addImage(MOSAICO_FOTOS_EMPRESA, "JPEG", ML, y, LARGURA_MOSAICO, ALTURA_MOSAICO);
      y += ALTURA_MOSAICO + 10;
    } catch (e) {
      console.warn("[gerar-apresentacao] Não foi possível desenhar o mosaico de fotos:", e);
    }

    // ── Uma página por serviço/proposta anexada ────────────────
    // (Forma de pagamento e programação NÃO repetem aqui — ficam só
    // nas seções 4 e 5, mais abaixo, pra não duplicar a informação.)
    dados.propostasAnexadas.forEach((item, i) => {
      novaPagina();
      tituloSecao(`${i + 1}° Serviço — ${item.nomeServico || "(sem nome)"}`);

      if (item.proposta) {
        desenharOrcamentoNaApresentacao(item.proposta, item);
      } else {
        paragrafo("(Item preenchido manualmente, sem tabela de valores vinculada.)", { espacoDepois: 10 });
      }
    });

    // ── Página final: Pagamento, Programação, Garantia, Considerações ──
    novaPagina();

    tituloSecao("4. Formas de pagamento");
    dados.propostasAnexadas.forEach((item) => {
      if (item.formaPagamento) paragrafo(`${item.nomeServico || "Serviço"}: ${item.formaPagamento}`, { espacoDepois: 6 });
    });
    paragrafo(`Validade da Proposta: a proposta tem validade de ${dados.validadeDias || "10"} dias.`, { espacoDepois: 14 });

    tituloSecao("5. Programação");
    paragrafo("Informamos o seguinte cronograma para execução dos serviços:", { espacoDepois: 6 });
    dados.propostasAnexadas.forEach((item) => {
      if (item.programacao) paragrafo(`${item.nomeServico || "Serviço"}: ${item.programacao}.`, { espacoDepois: 4 });
    });
    paragrafo("Os prazos podem sofrer alterações conforme previsão do tempo, chegada de materiais necessários, e andamento interno do local.", { espacoDepois: 14 });

    tituloSecao("6. Garantia");
    const garantiaN = parseInt(dados.garantiaNumero, 10) || 0;
    paragrafo(`O contratado faz o fornecimento da garantia de ${garantiaN} (${numeroPorExtenso(garantiaN)}) ${dados.garantiaUnidade} para o serviço citado em proposta.`, { espacoDepois: 14 });

    tituloSecao("7. Considerações finais");
    if (dados.textoConsideracoes) paragrafo(dados.textoConsideracoes, { espacoDepois: 10 });
    if (dados.observacoesFinais) {
      garantirEspaco(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("OBSERVAÇÃO:", ML, y);
      y += 14;
      paragrafo(dados.observacoesFinais, { espacoDepois: 14 });
    }

    tituloSecao("8. Próxima etapa");
    if (dados.textoProximaEtapa) {
      // O último parágrafo (separado por linha em branco) fica em
      // negrito — é o aviso legal de "precisa assinar contrato",
      // igual estava em negrito no modelo original.
      const paragrafosEtapa = dados.textoProximaEtapa.split(/\n\s*\n/).filter((p) => p.trim());
      paragrafosEtapa.forEach((p, i) => {
        const ehUltimo = i === paragrafosEtapa.length - 1;
        paragrafo(p.trim(), { negrito: ehUltimo, espacoDepois: ehUltimo ? 0 : 10 });
      });
    }

    rodape();

    const nomeSugerido = `Proposta_${dados.nomeCliente.replace(/\s+/g, "_")}_${dados.numeroDocumento || new Date().toISOString().slice(0, 10)}`;
    const nomeDigitado = document.getElementById("campoNomeArquivoApres").value.trim();
    const nomeFinal = (nomeDigitado || nomeSugerido).replace(/\.pdf$/i, "") + ".pdf";
    doc.save(nomeFinal);

    // Salva (ou atualiza) o registro no servidor, pra aparecer na
    // lista de apresentações — não guarda o PDF em si, só os dados
    // do formulário (mais leve; o PDF é remontado na hora de baixar).
    try {
      const respostaSalvar = await apiSalvarApresentacao({
        id: apresentacaoIdAtual,
        nomeCliente: dados.nomeCliente,
        numeroDocumento: dados.numeroDocumento,
        data: dados.data,
        nomeLocal: dados.nomeLocal,
        fotoLocalChave: dados.fotoLocalChave,
        anosExperiencia: dados.anosExperiencia,
        textoAbertura: dados.textoAbertura,
        textoItem1: dados.textoItem1,
        textoItem2: dados.textoItem2,
        textoItem3: dados.textoItem3,
        garantiaNumero: dados.garantiaNumero,
        garantiaUnidade: dados.garantiaUnidade,
        validadeDias: dados.validadeDias,
        textoConsideracoes: dados.textoConsideracoes,
        observacoesFinais: dados.observacoesFinais,
        textoProximaEtapa: dados.textoProximaEtapa,
        nomeArquivo: nomeFinal,
        propostasAnexadas: dados.propostasAnexadas.map((p) => ({
          propostaId: p.propostaId, nomeServico: p.nomeServico,
          formaPagamento: p.formaPagamento, programacao: p.programacao,
        })),
      });
      if (respostaSalvar.ok) apresentacaoIdAtual = respostaSalvar.id;
    } catch (e) {
      console.warn("[gerar-apresentacao] PDF gerado, mas não foi possível salvar o registro:", e);
    }

    mostrarToast("PDF gerado com sucesso!");
  } catch (e) {
    console.error("[gerar-apresentacao] Erro ao gerar PDF:", e);
    mostrarToast("Erro ao gerar o PDF: " + e.message, "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// ====================================================
// REABRIR UMA APRESENTAÇÃO SALVA (link "Editar" ou "Baixar" da lista)
// ====================================================
async function carregarApresentacaoPorId(id) {
  const resposta = await apiListarApresentacoes();
  if (!resposta.ok) { mostrarToast("Não foi possível carregar a apresentação.", "erro"); return null; }
  const apresentacao = resposta.apresentacoes.find((a) => a.id === id);
  if (!apresentacao) { mostrarToast("Apresentação não encontrada.", "erro"); return null; }

  apresentacaoIdAtual = apresentacao.id;
  document.getElementById("campoNomeClienteApres").value = apresentacao.nomeCliente || "";
  document.getElementById("campoNumeroDoc").value = apresentacao.numeroDocumento || "";
  document.getElementById("campoDataDoc").value = apresentacao.data || "";
  document.getElementById("campoNomeLocalApres").value = apresentacao.nomeLocal || "";
  document.getElementById("campoAnosExperiencia").value = apresentacao.anosExperiencia || 14;
  document.getElementById("campoTextoAbertura").value = apresentacao.textoAbertura || "";
  document.getElementById("campoTextoItem1").value = apresentacao.textoItem1 || "";
  document.getElementById("campoTextoItem2").value = apresentacao.textoItem2 || "";
  document.getElementById("campoTextoItem3").value = apresentacao.textoItem3 || "";
  document.getElementById("campoGarantiaNumero").value = apresentacao.garantiaNumero || 90;
  document.getElementById("campoGarantiaUnidade").value = apresentacao.garantiaUnidade || "dias";
  document.getElementById("campoValidadeDias").value = apresentacao.validadeDias || 10;
  document.getElementById("campoTextoConsideracoes").value = apresentacao.textoConsideracoes || "";
  document.getElementById("campoObservacoesFinais").value = apresentacao.observacoesFinais || "";
  document.getElementById("campoTextoProximaEtapa").value = apresentacao.textoProximaEtapa || "";
  document.getElementById("campoNomeArquivoApres").value = (apresentacao.nomeArquivo || "").replace(/\.pdf$/i, "");

  // Foto do local: busca a imagem já enviada (se tiver) pra mostrar
  // na prévia e ela poder ser reaproveitada no PDF.
  if (apresentacao.fotoLocalChave) {
    fotoLocalChave = apresentacao.fotoLocalChave;
    try {
      const token = await garantirTokenDownload();
      const urlFoto = `${WORKER_URL_APRES}?action=get&key=${encodeURIComponent(fotoLocalChave)}&token=${encodeURIComponent(token)}`;
      const imgResp = await fetch(urlFoto);
      const blob = await imgResp.blob();
      const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
      document.getElementById("fotoLocalImg").src = dataUrl;
      document.getElementById("fotoLocalImg").style.display = "block";
      document.getElementById("fotoLocalPlaceholder").style.display = "none";
      document.getElementById("btnRemoverFotoLocal").style.display = "inline-block";
    } catch (e) {
      console.warn("[gerar-apresentacao] Não foi possível recarregar a foto do local:", e);
    }
  }

  // Remove o bloco vazio inicial e recria um por proposta salva.
  document.getElementById("listaPropostasAnexadas").innerHTML = "";
  contadorBlocosProposta = 0;
  (apresentacao.propostasAnexadas || []).forEach((item) => {
    criarBlocoProposta();
    const bloco = document.querySelectorAll(".bloco-proposta-anexada");
    const ultimoBloco = bloco[bloco.length - 1];
    if (item.propostaId) {
      const select = ultimoBloco.querySelector(".campo-select-proposta-existente");
      select.value = item.propostaId;
    }
    ultimoBloco.querySelector(".campo-nome-servico-anexado").value = item.nomeServico || "";
    ultimoBloco.querySelector(".campo-forma-pagamento-anexada").value = item.formaPagamento || "";
    ultimoBloco.querySelector(".campo-programacao-anexada").value = item.programacao || "";
    if (item.propostaId) atualizarPreviewProposta(ultimoBloco, buscarProposta(item.propostaId));
  });
  if ((apresentacao.propostasAnexadas || []).length === 0) criarBlocoProposta();

  return apresentacao;
}

// Se a URL veio com ?id=..., já carrega essa apresentação salva pra
// edição. Com ?baixar=1 junto, gera o PDF direto, sem precisar clicar
// em nada — é o que o botão "Baixar" da lista usa. Sem ?id (formulário
// novo), preenche o N° do Documento com a numeração automática, se
// estiver configurada.
(async function verificarParametrosUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    try {
      document.getElementById("campoNumeroDoc").value = String(await proximoNumeroSequencial("apresentacao"));
    } catch (e) { /* sem numeração configurada — segue sem número */ }
    return;
  }
  const apresentacao = await carregarApresentacaoPorId(id);
  if (apresentacao && params.get("baixar") === "1") {
    irParaEtapa(4);
    await gerarPdfApresentacao(coletarDadosApresentacao());
  }
})();

document.getElementById("btnConfigNumeracaoApres").addEventListener("click", () => {
  abrirModalConfigNumeracao("apresentacao", "Apresentação");
});

// Orçamentos chegaram da nuvem: atualiza a lista de clientes
document.addEventListener("propostas-carregadas", popularClientesApresDatalist);
