// ============================================================
// propostas-core.js
// Núcleo de dados compartilhado pelas 3 páginas do módulo de
// Propostas: orcamento.html, propostas.html e andamento.html.
// Todas leem/escrevem na MESMA lista (CHAVE_PROPOSTAS) — o que
// muda entre as páginas é só o filtro de status exibido.
//
// Ciclo de vida de uma proposta (campo "status"):
//   orcamento -> analise -> aprovada -> andamento -> finalizada
//                        -> negada
// ============================================================

const CHAVE_PROPOSTAS = "propostas_lista";
let obrasCache = []; // preenchido por carregarObrasCache() — Obras já vive no banco central (KV), não em localStorage

// ====================================================
// LEITURA / ESCRITA
// ====================================================
// ====================================================
// ORÇAMENTOS NA NUVEM
// Antes: só no navegador (localStorage) — sumiam ao limpar o histórico
// e não apareciam em outro computador/celular.
// Agora: o servidor (Worker) é quem guarda. O site mantém uma cópia em
// memória (propostasCache) pra continuar lendo na hora, e:
//   • ao abrir a página, busca a lista atualizada no servidor e avisa
//     as telas (evento "propostas-carregadas") pra redesenharem;
//   • ao salvar, compara com o que tinha e manda pro servidor só os
//     orçamentos que mudaram (e apaga lá os que foram excluídos);
//   • na PRIMEIRA vez em cada navegador, envia os orçamentos que
//     estavam guardados só nele (migração automática, sem perder nada).
// Uma cópia de segurança fica no navegador (CHAVE_COPIA_LOCAL).
// ====================================================
const CHAVE_COPIA_LOCAL = "propostas_copia_nuvem";
const CHAVE_MIGRADO = "propostas_migradas_para_nuvem";
let propostasCache = (() => {
  try { return JSON.parse(localStorage.getItem(CHAVE_COPIA_LOCAL)) || JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS)) || []; }
  catch (e) { return []; }
})();
let propostasCarregadasDoServidor = false;

function guardarCopiaLocalPropostas() {
  try { localStorage.setItem(CHAVE_COPIA_LOCAL, JSON.stringify(propostasCache)); } catch (e) { /* cheio: segue sem cópia */ }
}

async function carregarPropostasDoServidor() {
  // 1) Migração: orçamentos que só existem neste navegador sobem pra nuvem
  if (!localStorage.getItem(CHAVE_MIGRADO)) {
    let antigas = [];
    try { antigas = JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS)) || []; } catch (e) { antigas = []; }
    if (antigas.length) {
      const r = await chamarWorker("propostas-salvar", { method: "POST", body: { propostas: antigas, somenteSeMaisNova: true } });
      if (!r.ok) {
        console.warn("[propostas] Migração não concluída, tenta de novo na próxima vez:", r.erro);
      } else {
        localStorage.setItem(CHAVE_MIGRADO, String(Date.now()));
        // Guarda o original com outro nome, por segurança (não é mais usado)
        localStorage.setItem(CHAVE_PROPOSTAS + "_backup_antes_da_nuvem", localStorage.getItem(CHAVE_PROPOSTAS));
        localStorage.removeItem(CHAVE_PROPOSTAS);
        console.info(`[propostas] ${r.salvas.length} orçamento(s) deste navegador enviados para a nuvem.`);
      }
    } else {
      localStorage.setItem(CHAVE_MIGRADO, String(Date.now()));
    }
  }

  // 2) Lista oficial, do servidor
  const resp = await chamarWorker("propostas-list");
  if (!resp.ok) {
    if (typeof mostrarToast === "function") mostrarToast("Sem conexão com o servidor — mostrando a última cópia salva neste aparelho.", "erro");
    return false;
  }
  propostasCache = resp.propostas || [];
  propostasCarregadasDoServidor = true;
  guardarCopiaLocalPropostas();
  document.dispatchEvent(new CustomEvent("propostas-carregadas"));
  return true;
}

// Devolve CÓPIAS dos orçamentos. Antes devolvia os mesmos objetos do
// cache: quem mudava o status (ex.: "Enviar para Análise") alterava o
// cache direto, e salvarPropostas não via diferença nenhuma — por isso
// a mudança nunca chegava no servidor e o orçamento "voltava" ao abrir
// outra tela.
function lerPropostas() {
  return propostasCache.map((p) => JSON.parse(JSON.stringify(p)));
}

// Recebe a lista completa (como sempre foi) e grava só a diferença no servidor
function salvarPropostas(lista) {
  const antes = new Map(propostasCache.map((p) => [p.id, JSON.stringify(p)]));
  const depoisIds = new Set(lista.map((p) => p.id));
  const mudaram = lista.filter((p) => antes.get(p.id) !== JSON.stringify(p));
  const excluidas = [...antes.keys()].filter((id) => !depoisIds.has(id));

  propostasCache = lista.map((p) => JSON.parse(JSON.stringify(p)));
  guardarCopiaLocalPropostas();

  const envios = [];
  if (mudaram.length) envios.push(chamarWorker("propostas-salvar", { method: "POST", body: { propostas: mudaram } }));
  excluidas.forEach((id) => envios.push(chamarWorker("propostas-excluir", { method: "POST", body: { id } })));
  const tudo = Promise.all(envios).then((respostas) => {
    const falhou = respostas.find((r) => !r || !r.ok);
    if (falhou && typeof mostrarToast === "function") {
      mostrarToast("Não foi possível salvar na nuvem agora. Confira a internet e salve de novo.", "erro");
    }
    return !falhou;
  });
  ultimoEnvioPropostas = tudo;
  return tudo;
}
let ultimoEnvioPropostas = Promise.resolve(true);

// Começa a buscar assim que a página abre
const propostasProntas = carregarPropostasDoServidor();

// Nome de quem responde pelo orçamento (o escolhido no formulário;
// se não tiver, quem criou)
function nomeResponsavelProposta(p) {
  return (p && (p.responsavelNome || p.criadoPorNome)) || "";
}

function buscarProposta(id) {
  const p = propostasCache.find((x) => x.id === id);
  return p ? JSON.parse(JSON.stringify(p)) : undefined;
}

// ── Monta os dados de NF-e/NFS-e a partir de uma proposta ────────
// Usado pelos botões "NF-e"/"NFS-e" direto no card da proposta (em
// andamento.html) — sem pergunta nenhuma, o clique no botão já é a
// confirmação. Cada botão só aparece se a proposta tiver o tipo de
// item correspondente (materiais para NF-e, mão de obra para NFS-e).
function valorFinalItemProposta(item) {
  if (item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "") {
    return parseFloat(item.valorFinal) || 0;
  }
  return (parseFloat(item.qtd) || 0) * (parseFloat(item.valorUnit) || 0);
}

function codificarDadosParaUrl(dados) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(dados))));
}

function propostaTemMateriais(proposta) {
  return (proposta.itensMateriais || []).some((i) => (i.nome || "").trim());
}
function propostaTemMaoDeObra(proposta) {
  return (proposta.itensMaoDeObra || []).some((i) => (i.descricao || "").trim());
}

function montarDadosNfe(proposta) {
  return {
    cliente: proposta.cliente,
    local: proposta.local,
    observacao: proposta.observacao,
    propostaId: proposta.id,
    itens: (proposta.itensMateriais || [])
      .filter((i) => (i.nome || "").trim())
      .map((i) => ({ descricao: i.nome, quantidade: parseFloat(i.qtd) || 1, valorUnitario: parseFloat(i.valorUnit) || (valorFinalItemProposta(i) / (parseFloat(i.qtd) || 1)) })),
  };
}

function montarDadosNfse(proposta) {
  return {
    cliente: proposta.cliente,
    local: proposta.local,
    observacao: proposta.observacao,
    propostaId: proposta.id,
    itens: (proposta.itensMaoDeObra || [])
      .filter((i) => (i.descricao || "").trim())
      .map((i) => ({ descricao: i.descricao, quantidade: parseFloat(i.qtd) || 1, valorUnitario: parseFloat(i.valorUnit) || (valorFinalItemProposta(i) / (parseFloat(i.qtd) || 1)) })),
  };
}

function linkParaNfe(proposta) {
  return `nfe.html?dados=${encodeURIComponent(codificarDadosParaUrl(montarDadosNfe(proposta)))}`;
}
function linkParaNfse(proposta) {
  return `nfse.html?dados=${encodeURIComponent(codificarDadosParaUrl(montarDadosNfse(proposta)))}`;
}

function criarPropostaVazia() {
  return {
    id: `prop_${Date.now()}`,
    numeroOrcamento: "",          // número manual do orçamento
    cliente: "",
    telefone: "",
    local: "",
    servico: "",
    observacao: "",
    itensMaoDeObra: [],
    itensMateriais: [],
    formaPagamento: "",
    entradaPerc: 0,
    parcelas: 0,
    prazosParcelas: "",
    garantia: "",
    planejamentoDias: "",
    validadeDias: "",
    localDescricao: "",          // "Local" (ex.: bloco B, fachada) — o "local" antigo virou o Endereço
    dadosVisitaInterno: "",      // medidas/anotações da visita — só PDF interno
    descontoMaoDeObra: 0, descontoTipoMaoDeObra: "rs",
    descontoMateriais: 0, descontoTipoMateriais: "rs",
    status: "orcamento",
    statusObra: "andamento",      // "andamento" | "finalizada" — visível nas obras
    statusExecucao: "",
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

function salvarProposta(proposta) {
  const lista = lerPropostas();
  proposta.atualizadoEm = new Date().toISOString();
  const idx = lista.findIndex((p) => p.id === proposta.id);
  if (idx !== -1) {
    lista[idx] = proposta;
  } else {
    lista.push(proposta);
  }
  return salvarPropostas(lista);
}

async function excluirProposta(id) {
  // Sincroniza com "Obras": se essa proposta tinha uma obra vinculada,
  // ela é excluída de vez também (proposta não tem lixeira própria,
  // então a obra ligada segue a mesma regra "sem volta").
  const obraLigada = lerObras().find((o) => o.propostaId === id);
  if (obraLigada) {
    await excluirObraDefinitivo(obraLigada.id);
  }

  const lista = lerPropostas().filter((p) => p.id !== id);
  salvarPropostas(lista);
}

// ====================================================
// TRANSIÇÕES DE STATUS
// ====================================================
async function mudarStatusProposta(id, novoStatus) {
  const lista = lerPropostas();
  const proposta = lista.find((p) => p.id === id);
  if (!proposta) return;

  proposta.status = novoStatus;

  // Ao aprovar, a proposta sai de "Propostas" e entra automaticamente
  // em "Em Andamento" (com sub-status inicial "andamento"), e cria
  // uma Obra vinculada na tela de Obras.
  if (novoStatus === "aprovada") {
    proposta.status = "andamento";
    proposta.statusExecucao = "andamento";
    await criarObraAPartirDaProposta(proposta);
  }

  proposta.atualizadoEm = new Date().toISOString();
  salvarPropostas(lista);
}

function mudarStatusExecucao(id, novoStatusExecucao) {
  const lista = lerPropostas();
  const proposta = lista.find((p) => p.id === id);
  if (!proposta) return;

  proposta.statusExecucao = novoStatusExecucao;
  if (novoStatusExecucao === "finalizada") {
    proposta.status = "finalizada";
  } else {
    proposta.status = "andamento";
  }
  proposta.atualizadoEm = new Date().toISOString();
  salvarPropostas(lista);
}

// Desfaz a aprovação: volta a proposta de "Em Andamento" para
// "Propostas" (status "analise"), permitindo reavaliar.
function reverterParaAnalise(id) {
  const lista = lerPropostas();
  const proposta = lista.find((p) => p.id === id);
  if (!proposta) return;

  proposta.status = "analise";
  proposta.statusExecucao = "";
  proposta.atualizadoEm = new Date().toISOString();
  salvarPropostas(lista);
}

// ====================================================
// SINCRONIZAÇÃO COM GESTÃO DE MATERIAIS E SERVIÇOS
// ====================================================
// Cache local, carregado da nuvem (ver carregarCatalogosDeItens()).
// Itens de proposta agora se ligam ao catálogo por "id" (não mais
// por posição/índice de array como antes — isso quebrava assim que
// os dados passaram a viver na nuvem, onde a ordem pode mudar).
let materiaisEstoqueCache = [];
let servicosCatalogoCache = [];

async function carregarCatalogosDeItens() {
  const [respMateriais, respServicos] = await Promise.all([apiListarMateriais(), apiListarServicos()]);
  materiaisEstoqueCache = respMateriais.ok ? respMateriais.materiais : [];
  servicosCatalogoCache = respServicos.ok ? respServicos.servicos : [];
}

function lerMateriaisEstoque() {
  return materiaisEstoqueCache;
}
function lerServicosCatalogo() {
  return servicosCatalogoCache;
}

// Encontra o material/serviço no catálogo a partir do id guardado no
// item da proposta. Retorna null se não encontrar (ex: foi excluído
// do catálogo depois, ou é um item antigo de antes da migração pra
// nuvem, que usava índice em vez de id).
function encontrarMaterialNoEstoque(materialId) {
  if (!materialId) return null;
  return materiaisEstoqueCache.find((m) => m.id === materialId) || null;
}
function encontrarServicoNoCatalogo(servicoId) {
  if (!servicoId) return null;
  return servicosCatalogoCache.find((s) => s.id === servicoId) || null;
}

// Pergunta ao usuário se a edição de um item vinculado deve ser
// propagada de volta pro catálogo (Gestão de Materiais / Serviços).
async function perguntarSincronizarMaterial(nomeMaterial) {
  return confirmarAcao(
    `Atualizar "${nomeMaterial}" na Gestão de Materiais também?`,
    "Isso vai sobrescrever o nome e o valor desse material no catálogo com os novos valores."
  );
}
async function perguntarSincronizarServico(nomeServico) {
  return confirmarAcao(
    `Atualizar "${nomeServico}" no catálogo de Serviços também?`,
    "Isso vai sobrescrever o nome e o valor desse serviço no catálogo com os novos valores."
  );
}

// Atualiza o material/serviço no catálogo com os novos dados vindos
// da proposta, preservando os outros campos (fiscais, etc.) que já
// existiam — só troca nome e valor.
async function atualizarMaterialNoEstoque(materialId, novosDados) {
  const existente = encontrarMaterialNoEstoque(materialId);
  if (!existente) return;
  const atualizado = { ...existente, nome: novosDados.nome, valor: novosDados.valorUnit };
  const resposta = await apiSalvarMaterial(atualizado);
  if (resposta.ok) {
    const idx = materiaisEstoqueCache.findIndex((m) => m.id === materialId);
    if (idx !== -1) materiaisEstoqueCache[idx] = atualizado;
  }
}
async function atualizarServicoNoCatalogo(servicoId, novosDados) {
  const existente = encontrarServicoNoCatalogo(servicoId);
  if (!existente) return;
  const atualizado = { ...existente, nome: novosDados.nome, valor: novosDados.valorUnit };
  const resposta = await apiSalvarServico(atualizado);
  if (resposta.ok) {
    const idx = servicosCatalogoCache.findIndex((s) => s.id === servicoId);
    if (idx !== -1) servicosCatalogoCache[idx] = atualizado;
  }
}

// ====================================================
// CÁLCULOS
// ====================================================
// Soma igual à do formulário: respeita o "Valor Final" digitado no
// item (antes era sempre Qtd × Valor Unit., e um item só com Valor
// Final saía R$ 0,00 no PDF) e inclui o Ajuste (desconto/acréscimo).
// Número digitado com vírgula ou ponto ("10,5" ou "10.5")
function numeroDigitadoProposta(texto) {
  let t = String(texto === undefined || texto === null ? "" : texto).trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) || n < 0 ? 0 : n;
}
// Desconto em R$ ou % sobre o subtotal (nunca maior que o subtotal)
function valorDescontoProposta(subtotal, valor, tipo) {
  const v = Number(valor) || 0;
  if (!v || subtotal <= 0) return 0;
  const d = tipo === "pct" ? subtotal * Math.min(v, 100) / 100 : v;
  return Math.min(Math.round(d * 100) / 100, subtotal);
}
function subtotalMaoDeObra(proposta) {
  return (proposta.itensMaoDeObra || []).reduce((s, item) => s + valorFinalItemProposta(item), 0);
}
function subtotalMateriais(proposta) {
  return (proposta.itensMateriais || []).reduce((s, item) => s + valorFinalItemProposta(item), 0);
}
function descontoMaoDeObra(proposta) {
  return valorDescontoProposta(subtotalMaoDeObra(proposta), proposta.descontoMaoDeObra, proposta.descontoTipoMaoDeObra);
}
function descontoMateriais(proposta) {
  return valorDescontoProposta(subtotalMateriais(proposta), proposta.descontoMateriais, proposta.descontoTipoMateriais);
}
// Total = subtotal - desconto + ajuste
function totalMaoDeObra(proposta) {
  return subtotalMaoDeObra(proposta) - descontoMaoDeObra(proposta) + (parseFloat(proposta.ajusteMaoDeObra) || 0);
}
function totalMateriais(proposta) {
  return subtotalMateriais(proposta) - descontoMateriais(proposta) + (parseFloat(proposta.ajusteMateriais) || 0);
}

// Texto da forma de pagamento com entrada/parcelas, pro PDF e pra prévia
// no formulário. "semValores" = PDF descritivo (só %, sem R$).
function linhasCondicaoPagamento(proposta, comValores) {
  const linhas = [];
  const total = proposta._totalForcado !== undefined ? proposta._totalForcado : totalGeral(proposta);
  const forma = (proposta.formaPagamento || "").trim();
  const entrada = Number(proposta.entradaPerc) || 0;
  const parcelas = parseInt(proposta.parcelas, 10) || 0;
  const prazos = (proposta.prazosParcelas || "").trim();
  const rs = (v) => `R$ ${formatarMoeda(v)}`;
  if (entrada > 0 || parcelas > 0) {
    const valorEntrada = total * entrada / 100;
    const saldo = total - valorEntrada;
    let t = "";
    if (entrada > 0) t += `Entrada de ${String(entrada).replace(".", ",")}%${comValores ? ` (${rs(valorEntrada)})` : ""}`;
    if (parcelas > 0) {
      const desc = parcelas === 1 ? "parcela" : "parcelas";
      t += `${t ? " e saldo" : "Pagamento"} em ${parcelas} ${desc}${comValores ? ` de ${rs(saldo / parcelas)}` : ""}`;
      if (prazos) t += ` (${prazos})`;
    } else if (entrada > 0 && entrada < 100) {
      t += ` e saldo restante${comValores ? ` de ${rs(saldo)}` : ""}${prazos ? " em " + prazos : " na finalização"}`;
    }
    linhas.push(t + (forma ? `, via ${forma}` : "") + ".");
  } else if (forma) {
    linhas.push(forma.endsWith(".") ? forma : forma + ".");
  }
  return linhas;
}
function totalGeral(proposta) {
  return totalMaoDeObra(proposta) + totalMateriais(proposta);
}

function formatarMoeda(valor) {
  return (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ====================================================
// IMPOSTOS DO ORÇAMENTO (só para a empresa — nunca vai no PDF do cliente)
// ====================================================
// A tabela de % por mês é a MESMA da tela de Comissão (chave
// "impostosMensaisComissao") — assim o INSS/ISS é digitado num lugar
// só. Formato: { "2026-8": { inss: 11, iss: 5, material: 3 } }, mês
// 0-indexado (igual Date.getMonth()).
// Cada orçamento guarda uma CÓPIA das % em proposta.impostos — mudar
// a tabela depois não altera orçamentos que já existem.
const CHAVE_TABELA_IMPOSTOS_MES = "impostosMensaisComissao";
const NOMES_MESES_IMPOSTOS_ORC = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let tabelaImpostosMesCache = {};

async function carregarTabelaImpostosMes() {
  try {
    const resp = await apiDataGet(CHAVE_TABELA_IMPOSTOS_MES);
    tabelaImpostosMesCache = (resp && resp.ok && resp.valor) ? resp.valor : {};
  } catch (e) {
    // Sem conexão: segue com o que já tinha — o usuário pode digitar as % na mão.
  }
  return tabelaImpostosMesCache;
}

function chaveMesImpostosOrc(data) {
  const d = data ? new Date(data) : new Date();
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function rotuloMesImpostosOrc(chave) {
  const [ano, mes] = String(chave || "").split("-").map(Number);
  if (isNaN(ano) || isNaN(mes)) return "-";
  return `${NOMES_MESES_IMPOSTOS_ORC[mes]} de ${ano}`;
}

// Mesma janela da Comissão: 3 meses à frente até 24 para trás.
function opcoesMesesImpostosHtml(chaveSelecionada) {
  const hoje = new Date();
  const chaves = [];
  for (let i = -3; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    chaves.push(`${d.getFullYear()}-${d.getMonth()}`);
  }
  if (chaveSelecionada && !chaves.includes(chaveSelecionada)) chaves.push(chaveSelecionada);
  return chaves.map((c) => `<option value="${c}" ${c === chaveSelecionada ? "selected" : ""}>${rotuloMesImpostosOrc(c)}</option>`).join("");
}

function taxasPadraoDoMesOrc(chave) {
  const t = tabelaImpostosMesCache[chave] || {};
  return { inss: Number(t.inss) || 0, iss: Number(t.iss) || 0, material: Number(t.material) || 0 };
}

function impostosPadraoParaProposta(chave) {
  return { mesRef: chave, ...taxasPadraoDoMesOrc(chave) };
}

// INSS e ISS: só sobre a Mão de Obra. Material: só sobre os Materiais.
// Em Curitiba o ISS não entra; fora de Curitiba entram INSS e ISS.
// O imposto de material vale sempre.
function calcularImpostosProposta(proposta) {
  const imp = proposta.impostos || {};
  const emCuritiba = (proposta.localObra || "curitiba") === "curitiba";
  const baseMO = totalMaoDeObra(proposta);
  const baseMat = totalMateriais(proposta);
  const inssPerc = Number(imp.inss) || 0;
  const issPerc = emCuritiba ? 0 : (Number(imp.iss) || 0);
  const matPerc = Number(imp.material) || 0;
  const valorInss = baseMO * inssPerc / 100;
  const valorIss = baseMO * issPerc / 100;
  const valorMat = baseMat * matPerc / 100;
  const total = valorInss + valorIss + valorMat;
  return {
    emCuritiba, baseMO, baseMat, inssPerc, issPerc, matPerc,
    valorInss, valorIss, valorMat, total,
    liquido: totalGeral(proposta) - total,
  };
}

// ====================================================
// RÓTULOS E CORES DE STATUS
// ====================================================
function rotuloStatus(proposta) {
  const mapa = {
    orcamento: "Orçamento",
    analise: "Em Análise",
    negada: "Negada",
    andamento: proposta.statusExecucao === "finalizada" ? "Finalizada" : "Em Andamento",
    finalizada: "Finalizada",
  };
  return mapa[proposta.status] || proposta.status;
}

function corStatus(proposta) {
  if (proposta.status === "analise") return "amarelo";
  if (proposta.status === "negada") return "vermelho";
  if (proposta.status === "andamento" || proposta.status === "finalizada") return "verde";
  return "cinza"; // orcamento (ainda não enviado para análise)
}

// ====================================================
// OBRAS (criadas automaticamente ao aprovar uma proposta)
// ====================================================
function lerObras() {
  return obrasCache;
}
async function carregarObrasCache() {
  const resp = await apiListarObras();
  obrasCache = resp.ok ? resp.obras : [];
}
function buscarObra(id) {
  return lerObras().find((o) => o.id === id);
}

// Cria a obra a partir da proposta aprovada. Se a proposta já tiver
// uma obra vinculada (ex: aprovação repetida), não duplica.
async function criarObraAPartirDaProposta(proposta) {
  const jaExiste = lerObras().some((o) => o.propostaId === proposta.id);
  if (jaExiste) return;

  const obra = {
    id: `obra_${Date.now()}`,
    propostaId: proposta.id,
    cliente: proposta.cliente,
    local: proposta.local,
    servico: proposta.servico,
    valorMaoDeObraOrcamento: totalMaoDeObra(proposta),
    valorMateriaisOrcamento: totalMateriais(proposta),
    // % de INSS/ISS vindas do orçamento — a Comissão usa estas em vez
    // da tabela do mês. Em Curitiba o ISS vai como 0.
    inssPercentualObra: proposta.impostos ? calcularImpostosProposta(proposta).inssPerc : null,
    issPercentualObra: proposta.impostos ? calcularImpostosProposta(proposta).issPerc : null,
    observacao: "",
    funcionarios: [], // { id, nome, valorCobrado, valorPago, pagamentoMes }
    materiais: [], // { id, nome, codigo, valor, data }
    statusObra: "andamento",
  };

  const resp = await apiSalvarObra(obra);
  if (resp.ok) obrasCache.push(resp.obra);
}

async function salvarObra(obra) {
  const resp = await apiSalvarObra(obra);
  if (resp.ok) {
    const idx = obrasCache.findIndex((o) => o.id === obra.id);
    if (idx !== -1) obrasCache[idx] = resp.obra;
    else obrasCache.push(resp.obra);
  }
  return resp;
}

async function excluirObra(id) {
  // Move para lixeira em vez de excluir definitivo
  const resp = await apiExcluirObra(id);
  if (!resp.ok) return resp;

  const idx = obrasCache.findIndex((o) => o.id === id);
  if (idx !== -1) {
    obrasCache[idx].lixeira = true;
    obrasCache[idx].lixeiraEm = new Date().toISOString();

    // Sincroniza com "Em Andamento": a proposta ligada some de lá
    // também, enquanto a obra estiver na lixeira.
    const propostaLigada = lerPropostas().find((p) => p.id === obrasCache[idx].propostaId);
    if (propostaLigada) {
      propostaLigada.lixeiraObra = true;
      salvarProposta(propostaLigada);
    }
  }
  return resp;
}

async function excluirObraDefinitivo(id) {
  const obra = lerObras().find((o) => o.id === id);

  // Sincroniza com "Em Andamento": exclui a proposta ligada de vez também.
  if (obra && obra.propostaId) {
    salvarPropostas(lerPropostas().filter((p) => p.id !== obra.propostaId));
  }

  const resp = await apiExcluirObraDefinitivo(id);
  if (resp.ok) obrasCache = obrasCache.filter((o) => o.id !== id);
  return resp;
}

async function restaurarObra(id) {
  const resp = await apiRestaurarObra(id);
  if (!resp.ok) return resp;

  const idx = obrasCache.findIndex((o) => o.id === id);
  if (idx !== -1) {
    delete obrasCache[idx].lixeira;
    delete obrasCache[idx].lixeiraEm;

    // Sincroniza com "Em Andamento": a proposta ligada volta a aparecer.
    const propostaLigada = lerPropostas().find((p) => p.id === obrasCache[idx].propostaId);
    if (propostaLigada) {
      delete propostaLigada.lixeiraObra;
      salvarProposta(propostaLigada);
    }
  }
  return resp;
}

function lerObrasAtivas()   { return lerObras().filter((o) => !o.lixeira && (!o.statusObra || o.statusObra !== "finalizada")); }
function lerObrasFinaliz()  { return lerObras().filter((o) => !o.lixeira && o.statusObra === "finalizada"); }
function lerObrasLixeira()  { return lerObras().filter((o) => !!o.lixeira); }

async function alternarStatusObra(id) {
  const obra = lerObras().find((o) => o.id === id);
  if (!obra) return;
  const vaiFinalizarAgora = obra.statusObra !== "finalizada";
  obra.statusObra = vaiFinalizarAgora ? "finalizada" : "andamento";
  // Guarda quando finalizou, pra Comissão conseguir agrupar por mês —
  // some de novo se voltar pra "andamento" por engano.
  obra.dataFinalizacao = vaiFinalizarAgora ? new Date().toISOString() : null;
  await salvarObra(obra);
  // Sincroniza com proposta vinculada se existir
  const propostaId = obra.propostaId;
  if (propostaId) {
    const p = buscarProposta(propostaId);
    if (p) {
      p.statusObra = obra.statusObra;
      p.status = obra.statusObra;
      salvarProposta(p);
    }
  }
}

// ----- Funcionários da obra (vinculados ao Financeiro) -----
// Agora na nuvem (ver carregarFinanceiroFunc em auth-worker.js)
async function lerFuncionariosFinanceiro() {
  return (await carregarFinanceiroFunc()).funcionarios;
}
async function salvarFuncionariosFinanceiro(lista) {
  return salvarFinanceiroFunc({ ...financeiroFuncCache, funcionarios: lista });
}

const NOMES_MESES_OBRA = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Adiciona um funcionário na obra E cria automaticamente o
// pagamento correspondente no Financeiro de Funcionários, usando
// o nome da obra (cliente + serviço) como referência de "obra".
async function adicionarFuncionarioNaObra(obraId, dadosFuncionario) {
  const obra = buscarObra(obraId);
  if (!obra) return;

  const nomeObraNoFinanceiro = nomeObraParaFinanceiro(obra);
  const mesAtual = NOMES_MESES_OBRA[new Date().getMonth()];
  const vinculoId = `vinculo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Garante que essa "obra" existe na lista fixa de obras do
  // Financeiro de Funcionários (obrasFinanceiro), senão ela não
  // aparece nos seletores por lá.
  const dadosFin = await carregarFinanceiroFunc();
  const obrasFinanceiro = dadosFin.obras;
  if (!obrasFinanceiro.includes(nomeObraNoFinanceiro)) obrasFinanceiro.push(nomeObraNoFinanceiro);

  // Cria o pagamento no Financeiro de Funcionários, marcado com um
  // ID de vínculo estável (em vez de depender da posição no array,
  // que mudaria se outro pagamento fosse excluído antes dele).
  const financeiro = dadosFin.funcionarios;
  financeiro.push({
    nome: dadosFuncionario.nome,
    obra: nomeObraNoFinanceiro,
    mes: mesAtual,
    valor: dadosFuncionario.valorPago,
    comprovante: null,
    vinculoObraId: vinculoId,
  });
  await salvarFinanceiroFunc({ obras: obrasFinanceiro, funcionarios: financeiro });

  obra.funcionarios.push({
    id: `func_${Date.now()}`,
    nome: dadosFuncionario.nome,
    valorCobrado: dadosFuncionario.valorCobrado,
    valorPago: dadosFuncionario.valorPago,
    vinculoObraId: vinculoId,
  });

  await salvarObra(obra);
}

function nomeObraParaFinanceiro(obra) {
  const partes = [obra.cliente, obra.servico].filter(Boolean);
  return partes.join(" — ") || "Obra sem nome";
}

// Atualiza um funcionário já existente na obra, e sincroniza o
// valor pago de volta no Financeiro de Funcionários.
async function editarFuncionarioNaObra(obraId, funcionarioId, dadosNovos) {
  const obra = buscarObra(obraId);
  if (!obra) return;

  const func = obra.funcionarios.find((f) => f.id === funcionarioId);
  if (!func) return;

  func.nome = dadosNovos.nome;
  func.valorCobrado = dadosNovos.valorCobrado;
  func.valorPago = dadosNovos.valorPago;

  // Sincroniza com o Financeiro de Funcionários, procurando pelo
  // ID de vínculo estável (funciona mesmo que outros pagamentos
  // tenham sido excluídos/reordenados desde a criação).
  if (func.vinculoObraId) {
    const financeiro = await lerFuncionariosFinanceiro();
    const pagamento = financeiro.find((p) => p.vinculoObraId === func.vinculoObraId);
    if (pagamento) {
      pagamento.nome = dadosNovos.nome;
      pagamento.valor = dadosNovos.valorPago;
      await salvarFuncionariosFinanceiro(financeiro);
    }
  }

  await salvarObra(obra);
}

async function excluirFuncionarioDaObra(obraId, funcionarioId) {
  const obra = buscarObra(obraId);
  if (!obra) return;

  const func = obra.funcionarios.find((f) => f.id === funcionarioId);
  obra.funcionarios = obra.funcionarios.filter((f) => f.id !== funcionarioId);
  await salvarObra(obra);

  // Remove também o pagamento vinculado no Financeiro, se existir
  // (procurado pelo ID de vínculo, não por posição no array).
  if (func && func.vinculoObraId) {
    const financeiro = await lerFuncionariosFinanceiro();
    const novoFinanceiro = financeiro.filter((p) => p.vinculoObraId !== func.vinculoObraId);
    await salvarFuncionariosFinanceiro(novoFinanceiro);
  }
}

// ----- Materiais da obra (anotação livre, sem vínculo de estoque) -----
async function adicionarMaterialNaObra(obraId, dadosMaterial) {
  const obra = buscarObra(obraId);
  if (!obra) return;
  obra.materiais.push({
    id: `mat_${Date.now()}`,
    nome: dadosMaterial.nome || "",
    codigo: dadosMaterial.codigo || "",
    valor: dadosMaterial.valor || 0,
    data: dadosMaterial.data || "",
  });
  await salvarObra(obra);
}

async function editarMaterialNaObra(obraId, materialId, dadosNovos) {
  const obra = buscarObra(obraId);
  if (!obra) return;
  const mat = obra.materiais.find((m) => m.id === materialId);
  if (!mat) return;
  mat.nome = dadosNovos.nome || "";
  mat.codigo = dadosNovos.codigo || "";
  mat.valor = dadosNovos.valor || 0;
  mat.data = dadosNovos.data || "";
  await salvarObra(obra);
}

async function excluirMaterialDaObra(obraId, materialId) {
  const obra = buscarObra(obraId);
  if (!obra) return;
  obra.materiais = obra.materiais.filter((m) => m.id !== materialId);
  await salvarObra(obra);
}

// ----- Cálculos de lucro -----
function totalPagoFuncionariosObra(obra) {
  return obra.funcionarios.reduce((s, f) => s + (f.valorPago || 0), 0);
}
function totalCobradoFuncionariosObra(obra) {
  return obra.funcionarios.reduce((s, f) => s + (f.valorCobrado || 0), 0);
}
function totalGastoMateriaisObra(obra) {
  return obra.materiais.reduce((s, m) => s + (m.valor || 0), 0);
}
function lucroMaoDeObraObra(obra) {
  return (obra.valorMaoDeObraOrcamento || 0) - totalPagoFuncionariosObra(obra);
}
function lucroMaterialObra(obra) {
  return (obra.valorMateriaisOrcamento || 0) - totalGastoMateriaisObra(obra);
}
function lucroTotalObra(obra) {
  return lucroMaoDeObraObra(obra) + lucroMaterialObra(obra);
}

// ====================================================
// GERAÇÃO DE PDF
// ============================================================
// Layout inspirado na planilha de proposta da empresa: cabeçalho
// com dados fixos da empresa, dados do cliente/obra, tabela de
// Mão de Obra, tabela de Materiais, totais, condições de
// pagamento e situação atual.
// ============================================================
const EMPRESA_INFO = FNX_EMPRESA; // dados em config.js

// modo "cliente": o que o cliente pode ver (sem impostos, sem links,
//   sem os dados internos da visita, sem observação interna dos itens).
// modo "interno": tudo — impostos, links, dados da visita (medidas e
//   anotações) e observações internas. Nunca enviar ao cliente.
// modo "descritivo": só os itens e as condições, SEM nenhum valor —
//   pro cliente entender o que está incluso.
function gerarPdfProposta(proposta, modo) {
  const interno = modo === "interno";
  const descritivo = modo === "descritivo";
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  const larguraPagina = doc.internal.pageSize.getWidth();
  const larguraUtil = larguraPagina - margem * 2;
  const LARANJA = [255, 106, 0];
  const ESCURO = [45, 45, 45];
  let y = 40;

  // ----- Cabeçalho: logo + dados da empresa -----
  const larguraLogo = 140;
  const alturaLogo = larguraLogo / (typeof LOGO_EMPRESA_PROPORCAO !== "undefined" ? LOGO_EMPRESA_PROPORCAO : 3.35);
  try {
    if (typeof LOGO_EMPRESA_BASE64 !== "undefined" && LOGO_EMPRESA_BASE64) {
      doc.addImage(LOGO_EMPRESA_BASE64, "JPEG", margem, y - 6, larguraLogo, alturaLogo);
    }
  } catch (e) {
    console.warn("[propostas-core] Não foi possível desenhar a logo no PDF:", e);
  }
  const xTextoEmpresa = margem + larguraLogo + 16;
  let yTexto = y + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  doc.text(`${EMPRESA_INFO.endereco} - ${EMPRESA_INFO.bairro} - ${EMPRESA_INFO.cidade}/${EMPRESA_INFO.estado} - CEP ${EMPRESA_INFO.cep}`, xTextoEmpresa, yTexto);
  yTexto += 12;
  doc.text(`CNPJ: ${EMPRESA_INFO.cnpj}  •  ${EMPRESA_INFO.email}`, xTextoEmpresa, yTexto);
  yTexto += 12;
  doc.text(`Fone: ${EMPRESA_INFO.fone} | ${EMPRESA_INFO.fone2}`, xTextoEmpresa, yTexto);
  yTexto += 12;
  doc.text(`${EMPRESA_INFO.instagram}  •  ${EMPRESA_INFO.site}`, xTextoEmpresa, yTexto);
  doc.setTextColor(0);
  y = Math.max(yTexto, y - 6 + alturaLogo) + 12;

  // ----- Faixa do título -----
  const titulo = descritivo ? "DESCRITIVO DOS SERVIÇOS" : "ORÇAMENTO";
  const numero = proposta.numeroOrcamento ? `Nº ${proposta.numeroOrcamento}` : "";
  doc.setFillColor(...ESCURO);
  doc.rect(margem, y, larguraUtil, 26, "F");
  doc.setFillColor(...LARANJA);
  doc.rect(margem, y, 6, 26, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`${titulo}${numero ? "  " + numero : ""}`, margem + 16, y + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const dataDoc = new Date(proposta.criadoEm || Date.now()).toLocaleDateString("pt-BR");
  doc.text(`${EMPRESA_INFO.cidade}, ${dataDoc}`, margem + larguraUtil - 10, y + 17, { align: "right" });
  doc.setTextColor(0);
  y += 40;

  if (interno || descritivo) {
    const aviso = interno ? "DOCUMENTO INTERNO — NÃO ENVIAR AO CLIENTE" : "Este documento descreve os itens da proposta, sem valores.";
    doc.setFillColor(interno ? 253 : 240, interno ? 240 : 246, interno ? 220 : 250);
    doc.setDrawColor(...(interno ? LARANJA : [180, 200, 220]));
    doc.rect(margem, y - 12, larguraUtil, 22, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...(interno ? [180, 110, 10] : [40, 80, 130]));
    doc.text(aviso, margem + larguraUtil / 2, y + 3, { align: "center" });
    doc.setTextColor(0);
    y += 24;
  }

  // ----- Dados do cliente / obra (duas colunas) -----
  const campos = [
    ["Cliente", proposta.cliente || "-"],
    ["CPF/CNPJ", proposta.documentoCliente || ""],
    ["Telefone", proposta.telefone || ""],
    ["Responsável", nomeResponsavelProposta(proposta)],
    ["Endereço", proposta.local || ""],
    ["Local", proposta.localDescricao || ""],
  ].filter(([, v]) => (v || "").trim());
  doc.autoTable({
    startY: y,
    body: campos.map(([k, v]) => [k + ":", v]),
    theme: "plain",
    margin: { left: margem, right: margem },
    styles: { fontSize: 9.5, cellPadding: { top: 2.5, bottom: 2.5, left: 0, right: 4 } },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  if ((proposta.servico || "").trim()) {
    y = garantirEspacoPdf(doc, y, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Serviço:", margem, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const servicoLinhas = doc.splitTextToSize(proposta.servico, larguraUtil);
    servicoLinhas.forEach((l) => { y = garantirEspacoPdf(doc, y, 14); doc.text(l, margem, y); y += 12; });
    y += 6;
  }

  // ----- Tabelas de itens -----
  const desenharTabela = (rotulo, itens, campoNome, subtotal, desconto, descontoInfo, ajuste, rotuloTotal) => {
    y = garantirEspacoPdf(doc, y, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ESCURO);
    doc.text(rotulo, margem, y);
    doc.setTextColor(0);
    y += 8;
    const cabeca = descritivo ? [["Item", "Qtd", "Unid", "Descrição"]] : [["Item", "Qtd", "Unid", "Descrição", "Valor Unit.", "Total"]];
    doc.autoTable({
      startY: y,
      head: cabeca,
      body: linhasItensPdf(itens, campoNome, interno, descritivo),
      margin: { left: margem, right: margem },
      styles: { fontSize: 9 },
      headStyles: { fillColor: LARANJA },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: descritivo
        ? { 0: { cellWidth: 32 }, 1: { cellWidth: 40, halign: "center" }, 2: { cellWidth: 40, halign: "center" } }
        : { 0: { cellWidth: 32 }, 1: { cellWidth: 36, halign: "center" }, 2: { cellWidth: 36, halign: "center" }, 4: { halign: "right", cellWidth: 72 }, 5: { halign: "right", cellWidth: 78 } },
      foot: descritivo ? undefined : rodapeTabelaPdf(subtotal, desconto, descontoInfo, ajuste, rotuloTotal),
      footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
    });
    y = doc.lastAutoTable.finalY + 20;
  };
  const infoDesconto = (valor, tipo) => (tipo === "pct" && valor ? `${String(valor).replace(".", ",")}%` : "");
  if ((proposta.itensMaoDeObra || []).length || !descritivo) {
    desenharTabela("MÃO DE OBRA", proposta.itensMaoDeObra, "descricao", subtotalMaoDeObra(proposta), descontoMaoDeObra(proposta),
      infoDesconto(proposta.descontoMaoDeObra, proposta.descontoTipoMaoDeObra), proposta.ajusteMaoDeObra, "Total Mão de Obra");
  }
  if ((proposta.itensMateriais || []).length || !descritivo) {
    desenharTabela("MATERIAIS", proposta.itensMateriais, "nome", subtotalMateriais(proposta), descontoMateriais(proposta),
      infoDesconto(proposta.descontoMateriais, proposta.descontoTipoMateriais), proposta.ajusteMateriais, "Total Materiais");
  }

  // ----- Total geral -----
  if (!descritivo) {
    y = garantirEspacoPdf(doc, y, 50);
    const descontoTotal = descontoMaoDeObra(proposta) + descontoMateriais(proposta);
    if (descontoTotal > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(176, 58, 46);
      doc.text(`Desconto aplicado: R$ ${formatarMoeda(descontoTotal)}`, margem + larguraUtil, y - 4, { align: "right" });
      doc.setTextColor(0);
      y += 6;
    }
    doc.setFillColor(...LARANJA);
    doc.rect(margem, y, larguraUtil, 28, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("MATERIAL E MÃO DE OBRA — TOTAL:", margem + 10, y + 18);
    doc.text(`R$ ${formatarMoeda(totalGeral(proposta))}`, margem + larguraUtil - 10, y + 18, { align: "right" });
    doc.setTextColor(0);
    y += 46;
  }

  if (interno) {
    // Dados da visita: medidas, descritivo e anotações (só interno)
    if ((proposta.dadosVisitaInterno || "").trim()) {
      y = garantirEspacoPdf(doc, y, 70);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DADOS DA VISITA (INTERNO)", margem, y);
      y += 6;
      doc.autoTable({
        startY: y,
        body: [[proposta.dadosVisitaInterno.trim()]],
        margin: { left: margem, right: margem },
        styles: { fontSize: 9, fillColor: [255, 251, 230], textColor: [60, 60, 60], cellPadding: 8, lineColor: [240, 226, 160], lineWidth: 0.6 },
        theme: "grid",
      });
      y = doc.lastAutoTable.finalY + 20;
    }

    const imp = calcularImpostosProposta(proposta);
    y = garantirEspacoPdf(doc, y, 150);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("IMPOSTOS (INTERNO)", margem, y);
    y += 8;
    const pct = (v) => `${String(v).replace(".", ",")}%`;
    doc.autoTable({
      startY: y,
      head: [["Descrição", "Base de cálculo", "%", "Valor"]],
      body: [
        ["Local da obra", imp.emCuritiba ? "Curitiba" : "Fora de Curitiba", "", ""],
        ["Mês de referência", rotuloMesImpostosOrc((proposta.impostos || {}).mesRef), "", ""],
        ["INSS (sobre mão de obra)", `R$ ${formatarMoeda(imp.baseMO)}`, pct(imp.inssPerc), `R$ ${formatarMoeda(imp.valorInss)}`],
        [imp.emCuritiba ? "ISS (não se aplica em Curitiba)" : "ISS (sobre mão de obra)", `R$ ${formatarMoeda(imp.baseMO)}`, pct(imp.issPerc), `R$ ${formatarMoeda(imp.valorIss)}`],
        ["Imposto de material", `R$ ${formatarMoeda(imp.baseMat)}`, pct(imp.matPerc), `R$ ${formatarMoeda(imp.valorMat)}`],
      ],
      foot: [
        ["Total de impostos", "", "", `R$ ${formatarMoeda(imp.total)}`],
        ["Valor líquido (total - impostos)", "", "", `R$ ${formatarMoeda(imp.liquido)}`],
      ],
      margin: { left: margem, right: margem },
      styles: { fontSize: 9 },
      headStyles: { fillColor: LARANJA },
      footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 20;

    // Links dos materiais (só no PDF interno), clicáveis
    const links = (proposta.linksMateriais || []).filter((l) => (l.nome || "").trim() || (l.url || "").trim());
    if (links.length) {
      y = garantirEspacoPdf(doc, y, 60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("LINKS DOS MATERIAIS (INTERNO)", margem, y);
      y += 14;
      doc.setFontSize(9);
      links.forEach((l) => {
        y = garantirEspacoPdf(doc, y, 30);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`• ${l.nome || "(sem nome)"}`, margem, y);
        y += 11;
        if ((l.url || "").trim()) {
          const url = /^https?:\/\//i.test(l.url.trim()) ? l.url.trim() : "https://" + l.url.trim();
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 90, 200);
          doc.splitTextToSize(url, larguraUtil - 12).forEach((linha) => {
            doc.textWithLink(linha, margem + 10, y, { url });
            y += 11;
          });
        }
        y += 4;
      });
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  // ----- Condições (mesma ordem da proposta comercial) -----
  const secoes = [];
  const pagamento = linhasCondicaoPagamento(proposta, !descritivo);
  if (pagamento.length) secoes.push(["Forma de Pagamento", pagamento.join(" ")]);
  if (proposta.validadeDias) secoes.push(["Validade", `Proposta tem validade de ${proposta.validadeDias} dias corridos.`]);
  if (proposta.planejamentoDias) secoes.push(["Programação",
    `Prazo previsto para execução dos serviços: ${proposta.planejamentoDias} dias úteis. Os prazos podem sofrer alterações conforme previsão do tempo, chegada de materiais necessários e andamento interno do local.`]);
  if ((proposta.garantia || "").trim()) secoes.push(["Garantia",
    `O contratado fornece garantia de ${proposta.garantia.trim()} para os serviços executados citados nesta proposta. Materiais conforme fornecedor.`]);
  secoes.push(["Início", "Início dos serviços após aprovação e formalização da proposta."]);

  y = garantirEspacoPdf(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ESCURO);
  doc.text("CONDIÇÕES", margem, y);
  doc.setDrawColor(...LARANJA);
  doc.setLineWidth(1);
  doc.line(margem, y + 4, margem + larguraUtil, y + 4);
  doc.setTextColor(0);
  y += 20;
  secoes.forEach(([tituloSec, texto], i) => {
    const linhas = doc.splitTextToSize(texto, larguraUtil - 14);
    y = garantirEspacoPdf(doc, y, 26 + linhas.length * 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${i + 1}. ${tituloSec}:`, margem, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    linhas.forEach((l) => { doc.text(l, margem + 14, y); y += 12; });
    y += 6;
  });

  y = garantirEspacoPdf(doc, y, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(200, 0, 0);
  doc.text("Não nos responsabilizamos por compra particular de material.", margem, y);
  doc.setTextColor(0);
  y += 18;

  // Observação: só a que foi escrita para o cliente no orçamento
  if ((proposta.observacao || "").trim()) {
    const linhasObs = doc.splitTextToSize(proposta.observacao.trim(), larguraUtil);
    y = garantirEspacoPdf(doc, y, 30 + linhasObs.length * 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observações:", margem, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    linhasObs.forEach((l) => { y = garantirEspacoPdf(doc, y, 14); doc.text(l, margem, y); y += 12; });
    y += 8;
  }

  if (interno) {
    y = garantirEspacoPdf(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Situação: ${rotuloStatus(proposta)}`, margem, y);
  }

  // Rodapé com número da página
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let pag = 1; pag <= totalPaginas; pag++) {
    doc.setPage(pag);
    const alt = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(margem, alt - 28, margem + larguraUtil, alt - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${EMPRESA_INFO.nome}  •  ${EMPRESA_INFO.site}`, margem, alt - 16);
    doc.text(`${pag} | Página`, margem + larguraUtil, alt - 16, { align: "right" });
    doc.setTextColor(0);
  }

  const sufixo = interno ? "_INTERNO" : descritivo ? "_descritivo" : "";
  const nomeArquivo = `proposta_${(proposta.numeroOrcamento ? proposta.numeroOrcamento + "_" : "")}${(proposta.cliente || "sem_nome").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}${sufixo}.pdf`;
  doc.save(nomeArquivo);
}

// Linhas da tabela de itens do PDF. Embaixo de cada item vão as
// observações: a do cliente sempre; a interna só no PDF interno.
// "semValores" (PDF descritivo): só Item, Qtd, Unid e Descrição.
function linhasItensPdf(itens, campoNome, interno, semValores) {
  const colunas = semValores ? 4 : 6;
  const linhas = [];
  (itens || []).forEach((item, i) => {
    const temQtd = item.qtd !== null && item.qtd !== undefined && item.qtd !== "" && Number(item.qtd) !== 0;
    const temUnit = item.valorUnit !== null && item.valorUnit !== undefined && item.valorUnit !== "" && Number(item.valorUnit) !== 0;
    const linha = [
      String(i + 1),
      temQtd ? String(item.qtd).replace(".", ",") : "-",
      item.unid || "",
      item[campoNome] || "",
    ];
    if (!semValores) {
      linha.push(temUnit ? `R$ ${formatarMoeda(Number(item.valorUnit))}` : "-");
      linha.push(`R$ ${formatarMoeda(valorFinalItemProposta(item))}`);
    }
    linhas.push(linha);
    const obsCliente = (item.obsCliente || "").trim();
    const obsInterna = (item.obsInterna || "").trim();
    if (obsCliente) {
      linhas.push([{ content: `Obs.: ${obsCliente}`, colSpan: colunas,
        styles: { fontStyle: "italic", textColor: [80, 80, 80], fontSize: 8 } }]);
    }
    if (interno && obsInterna) {
      linhas.push([{ content: `Interno: ${obsInterna}`, colSpan: colunas,
        styles: { fontStyle: "italic", textColor: [180, 110, 10], fontSize: 8, fillColor: [253, 244, 230] } }]);
    }
  });
  if (linhas.length) return linhas;
  return semValores ? [["-", "-", "-", "Nenhum item cadastrado"]] : [["-", "-", "-", "Nenhum item cadastrado", "-", "-"]];
}

// Rodapé da tabela: Subtotal / Desconto / Ajuste / Total (só mostra as
// linhas que existem).
function rodapeTabelaPdf(subtotal, desconto, descontoInfo, ajuste, rotuloTotal) {
  const aj = parseFloat(ajuste) || 0;
  const total = subtotal - (desconto || 0) + aj;
  const linha = (rotulo, valor) => [{ content: rotulo, colSpan: 5, styles: { halign: "right" } }, valor];
  if (!desconto && !aj) return [linha(rotuloTotal, `R$ ${formatarMoeda(total)}`)];
  const linhas = [linha("Subtotal", `R$ ${formatarMoeda(subtotal)}`)];
  if (desconto) linhas.push(linha(`Desconto${descontoInfo ? " (" + descontoInfo + ")" : ""}`, `- R$ ${formatarMoeda(desconto)}`));
  if (aj) linhas.push(linha(aj < 0 ? "Abatimento" : "Acréscimo", `${aj < 0 ? "- " : "+ "}R$ ${formatarMoeda(Math.abs(aj))}`));
  linhas.push(linha(rotuloTotal, `R$ ${formatarMoeda(total)}`));
  return linhas;
}

function garantirEspacoPdf(doc, y, minimo) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y + minimo > alturaPagina - 40) {
    doc.addPage();
    return 50;
  }
  return y;
}