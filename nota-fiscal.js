// ============================================================
// nota-fiscal.js — usado por nfe.html e nfse.html. A página que
// inclui este arquivo deve definir TIPO_NOTA_PAGINA ("NF-e" ou
// "NFS-e") antes de carregá-lo.
//
// IMPORTANTE: isso ainda NÃO emite nota fiscal de verdade — só
// organiza os dados para conferência. A emissão real depende do
// certificado digital A1, que ainda não está configurado. O botão
// "Emitir" mostra isso claramente em vez de fingir que funcionou.
// ============================================================

const IMPOSTOS_PADRAO = {
  "NF-e":  [{ nome: "ICMS", percentual: 18 }, { nome: "IPI", percentual: 0 }, { nome: "PIS", percentual: 0.65 }, { nome: "COFINS", percentual: 3 }],
  "NFS-e": [{ nome: "ISS", percentual: 5 }, { nome: "INSS", percentual: 11 }, { nome: "PIS", percentual: 0.65 }, { nome: "COFINS", percentual: 3 }, { nome: "CSLL", percentual: 1 }, { nome: "IRRF", percentual: 1.5 }],
};

// Valores padrão pra "Prestador de Serviços" — preencha na tela
// (ou em config.js). Fica editável
// na tela, e uma vez salvo, usa o que a pessoa configurou em vez
// desses valores.
const DADOS_EMPRESA_PADRAO = {
  cnpj: FNX_EMPRESA.cnpj || "",
  inscMunicipal: "",
  inscEstadual: "",
  inscEstadualSubstTrib: "",
  razaoSocial: FNX_EMPRESA.razaoSocial || "FNX DEV",
  endereco: FNX_EMPRESA.endereco || "",
  municipio: FNX_EMPRESA.cidade || "",
  uf: FNX_EMPRESA.uf || "",
  cep: FNX_EMPRESA.cep || "",
  fone: FNX_EMPRESA.fone || "",
  email: FNX_EMPRESA.email || "",
  cnae: "",
  atividade: "",
  regimeTributacao: "",
  optanteSimples: "",
  incentivadorCultural: "NÃO",
};

// Mapa "id do campo na tela" → "chave no objeto salvo" — usado tanto
// pra carregar quanto pra salvar, sem repetir a lista duas vezes.
// Inclui campos das duas telas — cada uma só tem os elementos que
// existem no seu próprio HTML, o resto é ignorado pelos guardas
// "if (el)" nas funções de carregar/salvar.
const MAPA_CAMPOS_EMPRESA = {
  empCnpj: "cnpj", empInscMunicipal: "inscMunicipal", empInscEstadual: "inscEstadual",
  empInscEstadualSubstTrib: "inscEstadualSubstTrib",
  empRazaoSocial: "razaoSocial", empEndereco: "endereco", empMunicipio: "municipio",
  empUf: "uf", empCep: "cep", empFone: "fone", empEmail: "email",
  empCnae: "cnae", empAtividade: "atividade", empRegimeTributacao: "regimeTributacao",
  empOptanteSimples: "optanteSimples", empIncentivadorCultural: "incentivadorCultural",
};

async function carregarDadosEmpresa() {
  if (!document.getElementById("empCnpj")) return; // página antiga (NF-e ainda não reconstruída)
  let dados = DADOS_EMPRESA_PADRAO;
  try {
    const resposta = await apiDataGet("empresaFiscal");
    if (resposta.ok && resposta.valor) dados = resposta.valor;
  } catch (e) { /* sem conexão — usa os valores padrão mesmo assim */ }

  Object.entries(MAPA_CAMPOS_EMPRESA).forEach(([idCampo, chave]) => {
    const el = document.getElementById(idCampo);
    if (el && dados[chave] !== undefined) el.value = dados[chave];
  });
}

async function salvarDadosEmpresa() {
  const botao = document.getElementById("btnSalvarDadosEmpresa");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    const dados = {};
    Object.entries(MAPA_CAMPOS_EMPRESA).forEach(([idCampo, chave]) => {
      const el = document.getElementById(idCampo);
      if (el) dados[chave] = el.value.trim();
    });
    const resposta = await apiDataSet("empresaFiscal", dados);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar.", "erro"); return; }
    mostrarToast("Dados da empresa salvos — valem pras próximas notas também.");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}
if (document.getElementById("btnSalvarDadosEmpresa")) {
  document.getElementById("btnSalvarDadosEmpresa").addEventListener("click", salvarDadosEmpresa);
}

let notaEmEdicaoId = null;
let notasCache = [];
let contatosCache = [];
let materiaisCache = [];
let servicosCache = [];

// ── Autocomplete de clientes/fornecedores e materiais/serviços ────
async function carregarAutocompleteContatos() {
  try {
    const resposta = await apiListarContatos();
    if (!resposta.ok) return;
    contatosCache = resposta.contatos;
    const datalist = document.getElementById("listaContatosDatalist");
    if (!datalist) return;
    datalist.innerHTML = contatosCache.map((c) => `<option value="${escaparHtml(c.nome)}"></option>`).join("");
  } catch (e) { /* autocomplete é um extra — se falhar, formulário continua funcionando normalmente */ }
}

// Quando o nome digitado bate exatamente com um contato cadastrado,
// preenche documento/endereço automaticamente.
function tentarAutopreencherTomador() {
  const nomeDigitado = document.getElementById("campoTomadorNome").value.trim();
  const contato = contatosCache.find((c) => c.nome === nomeDigitado);
  if (!contato) return;
  document.getElementById("campoTomadorDocumento").value = contato.documento || "";

  const temCamposSeparados = !!document.getElementById("campoTomadorMunicipio");
  const temCampoBairro = !!document.getElementById("campoTomadorBairro");
  const enderecoPartes = temCamposSeparados
    ? [contato.logradouro, contato.numero, temCampoBairro ? null : contato.bairro].filter(Boolean)
    : [contato.logradouro, contato.numero, contato.bairro, contato.cidade, contato.uf].filter(Boolean);
  document.getElementById("campoTomadorEndereco").value = enderecoPartes.join(", ");

  if (temCamposSeparados) {
    const preencheSe = (id, valor) => { const el = document.getElementById(id); if (el && valor) el.value = valor; };
    preencheSe("campoTomadorBairro", contato.bairro);
    preencheSe("campoTomadorMunicipio", contato.cidade);
    preencheSe("campoTomadorUf", contato.uf);
    preencheSe("campoTomadorCep", contato.cep);
  }
}

// ── Validação do documento (CPF ou CNPJ, detectado pelo tamanho) ──
document.getElementById("campoTomadorDocumento").addEventListener("blur", () => {
  const campo = document.getElementById("campoTomadorDocumento");
  const valor = campo.value.trim();
  limparErroCampo(campo);
  if (!valor) return;

  const digitos = valor.replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return; // ainda digitando, não julga incompleto como erro

  const valido = validarDocumento(valor);
  if (!valido) {
    marcarCampoComErro(campo, "Documento inválido — confira os números.");
    return;
  }
  campo.value = digitos.length === 14 ? formatarCNPJ(digitos) : formatarCPF(digitos);
});
limparErroAoEditar(document.getElementById("campoTomadorDocumento"));

// ── Buscar CNPJ na BrasilAPI (mesmo mecanismo já usado em Contatos) ──
// Não existe equivalente pra CPF: a Receita Federal não expõe dados
// de pessoa física publicamente (proteção de dados pessoais) — só
// valida o dígito verificador, não preenche nome/endereço sozinho.
document.getElementById("btnBuscarCnpjTomador").addEventListener("click", async () => {
  const campoDoc = document.getElementById("campoTomadorDocumento");
  const valor = campoDoc.value.trim();
  if (!valor) { mostrarToast("Digite o CNPJ primeiro.", "erro"); return; }

  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11) {
    mostrarToast("Isso parece um CPF, não um CNPJ — a busca automática só funciona para empresas (CNPJ). Preencha os dados da pessoa manualmente.", "erro");
    return;
  }

  const botao = document.getElementById("btnBuscarCnpjTomador");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";

  try {
    const resposta = await buscarCnpjNaBrasilApi(valor);
    if (!resposta.ok) { mostrarToast(resposta.erro, "erro"); return; }

    const d = resposta.dados;
    document.getElementById("campoTomadorNome").value = d.nome;
    campoDoc.value = formatarCNPJ(digitos);
    limparErroCampo(campoDoc);

    const temCamposSeparados = !!document.getElementById("campoTomadorMunicipio");
    const temCampoBairro = !!document.getElementById("campoTomadorBairro");
    const enderecoPartes = temCamposSeparados
      ? [d.logradouro, d.numero, d.complemento, temCampoBairro ? null : d.bairro].filter(Boolean)
      : [d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf].filter(Boolean);
    document.getElementById("campoTomadorEndereco").value = enderecoPartes.join(", ");

    if (temCamposSeparados) {
      const preencheSe = (id, valor) => { const el = document.getElementById(id); if (el && valor) el.value = valor; };
      preencheSe("campoTomadorBairro", d.bairro);
      preencheSe("campoTomadorMunicipio", d.cidade);
      preencheSe("campoTomadorUf", d.uf);
      preencheSe("campoTomadorCep", d.cep);
    }

    mostrarToast(
      d.situacaoCadastral && d.situacaoCadastral !== "ATIVA"
        ? `Dados preenchidos. Atenção: situação cadastral é "${d.situacaoCadastral}".`
        : "Dados preenchidos a partir da Receita Federal."
    );
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

async function carregarAutocompleteMateriais() {
  try {
    if (TIPO_NOTA_PAGINA === "NF-e") {
      const resposta = await apiListarMateriais();
      if (!resposta.ok) return;
      materiaisCache = resposta.materiais;
      const datalist = document.getElementById("listaMateriaisDatalist");
      if (datalist) datalist.innerHTML = materiaisCache.map((m) => `<option value="${escaparHtml(m.nome)}"></option>`).join("");
    } else if (TIPO_NOTA_PAGINA === "NFS-e") {
      const resposta = await apiListarServicos();
      if (!resposta.ok) return;
      servicosCache = resposta.servicos;
      const datalist = document.getElementById("listaServicosDatalist");
      if (datalist) datalist.innerHTML = servicosCache.map((s) => `<option value="${escaparHtml(s.nome)}"></option>`).join("");
    }
  } catch (e) { /* idem — extra, não bloqueia o uso manual */ }
}

// Quando a descrição de um item bate com um material/serviço já
// cadastrado, preenche o valor automaticamente (só se o campo de
// valor ainda estiver zerado, pra não sobrescrever algo digitado).
function tentarAutopreencherItem(linhaTr) {
  const descricao = linhaTr.querySelector(".item-descricao").value.trim();
  const cache = TIPO_NOTA_PAGINA === "NF-e" ? materiaisCache : servicosCache;
  const item = cache.find((i) => i.nome === descricao);
  if (!item || !item.valor) return;
  const campoValor = linhaTr.querySelector(".item-valor-unitario");
  if (!campoValor.value || Number(campoValor.value) === 0) {
    campoValor.value = item.valor;
    recalcularTotais();
  }
}

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Linhas de itens (materiais ou serviços) ─────────────────────
function adicionarLinhaItem(item) {
  item = item || { descricao: "", quantidade: 1, valorUnitario: 0 };
  const tbody = document.querySelector("#tabelaItens tbody");
  const tr = document.createElement("tr");

  if (TIPO_NOTA_PAGINA === "NF-e") {
    tr.innerHTML = `
      <td><input type="text" class="item-codigo" placeholder="Código" value="${escaparHtml(item.codigo || "")}" /></td>
      <td><input type="text" class="item-descricao" placeholder="Descrição" value="${escaparHtml(item.descricao || "")}" list="listaMateriaisDatalist" /></td>
      <td><input type="text" class="item-ncm" placeholder="NCM" value="${escaparHtml(item.ncm || "")}" /></td>
      <td><input type="text" class="item-csosn" placeholder="CSOSN" value="${escaparHtml(item.csosn || "0101")}" /></td>
      <td><input type="text" class="item-cfop" placeholder="CFOP" value="${escaparHtml(item.cfop || "5102")}" /></td>
      <td><input type="text" class="item-unidade" placeholder="UN" value="${escaparHtml(item.unidade || "UN")}" /></td>
      <td style="width:60px;"><input type="number" class="item-quantidade" min="0" step="0.01" value="${item.quantidade ?? 1}" /></td>
      <td style="width:115px;"><input type="number" class="item-valor-unitario" min="0" step="0.01" value="${item.valorUnitario ?? 0}" /></td>
      <td class="col-valor item-valor-total">${formatarMoeda((item.quantidade ?? 1) * (item.valorUnitario ?? 0))}</td>
      <td class="col-remover"><button type="button" class="btn-remover-linha" title="Remover">✕</button></td>
    `;
  } else {
    tr.innerHTML = `
      <td><input type="text" class="item-descricao" placeholder="Descrição" value="${escaparHtml(item.descricao || "")}" list="${TIPO_NOTA_PAGINA === "NF-e" ? "listaMateriaisDatalist" : "listaServicosDatalist"}" /></td>
      <td style="width:90px;"><input type="number" class="item-quantidade" min="0" step="0.01" value="${item.quantidade ?? 1}" /></td>
      <td style="width:130px;"><input type="number" class="item-valor-unitario" min="0" step="0.01" value="${item.valorUnitario ?? 0}" /></td>
      <td class="col-valor item-valor-total">${formatarMoeda((item.quantidade ?? 1) * (item.valorUnitario ?? 0))}</td>
      <td class="col-remover"><button type="button" class="btn-remover-linha" title="Remover">✕</button></td>
    `;
  }

  tr.querySelectorAll(".item-quantidade, .item-valor-unitario").forEach((input) => {
    input.addEventListener("input", recalcularTotais);
  });
  tr.querySelector(".item-descricao").addEventListener("change", () => tentarAutopreencherItem(tr));
  tr.querySelector(".btn-remover-linha").addEventListener("click", () => { tr.remove(); recalcularTotais(); });
  tbody.appendChild(tr);
}

// ── Linhas de impostos ───────────────────────────────────────────
function adicionarLinhaImposto(imposto) {
  imposto = imposto || { nome: "", percentual: 0 };
  const tbody = document.querySelector("#tabelaImpostos tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="imposto-nome" placeholder="ex: ISS" value="${escaparHtml(imposto.nome || "")}" /></td>
    <td style="width:110px;"><input type="number" class="imposto-percentual" min="0" step="0.01" value="${imposto.percentual ?? 0}" /> %</td>
    <td class="col-valor imposto-valor-calculado">${formatarMoeda(0)}</td>
    <td class="col-remover"><button type="button" class="btn-remover-linha" title="Remover">✕</button></td>
  `;
  tr.querySelector(".imposto-percentual").addEventListener("input", recalcularTotais);
  tr.querySelector(".btn-remover-linha").addEventListener("click", () => { tr.remove(); recalcularTotais(); });
  tbody.appendChild(tr);
}

// ── Cálculo de totais ────────────────────────────────────────────
function lerItensDoFormulario() {
  return [...document.querySelectorAll("#tabelaItens tbody tr")].map((tr) => {
    const item = {
      descricao: tr.querySelector(".item-descricao").value.trim(),
      quantidade: Number(tr.querySelector(".item-quantidade").value) || 0,
      valorUnitario: Number(tr.querySelector(".item-valor-unitario").value) || 0,
    };
    const campoCodigo = tr.querySelector(".item-codigo");
    if (campoCodigo) item.codigo = campoCodigo.value.trim();
    const campoNcm = tr.querySelector(".item-ncm");
    if (campoNcm) item.ncm = campoNcm.value.trim();
    const campoCfop = tr.querySelector(".item-cfop");
    if (campoCfop) item.cfop = campoCfop.value.trim();
    const campoCsosn = tr.querySelector(".item-csosn");
    if (campoCsosn) item.csosn = campoCsosn.value.trim();
    const campoUnidade = tr.querySelector(".item-unidade");
    if (campoUnidade) item.unidade = campoUnidade.value.trim();
    return item;
  });
}

function lerImpostosDoFormulario() {
  return [...document.querySelectorAll("#tabelaImpostos tbody tr")].map((tr) => ({
    nome: tr.querySelector(".imposto-nome").value.trim(),
    percentual: Number(tr.querySelector(".imposto-percentual").value) || 0,
  }));
}

function recalcularTotais() {
  if (TIPO_NOTA_PAGINA === "NFS-e") { recalcularTotaisNFSe(); return; }
  if (TIPO_NOTA_PAGINA === "NF-e" && document.getElementById("campoValorIpi")) { recalcularTotaisNFe(); return; }

  // Fallback antigo (tabela genérica de % sobre subtotal) — não deve
  // mais rodar, já que as duas telas foram reconstruídas, mas fica
  // como rede de segurança caso alguma das duas volte a um estado
  // intermediário.
  document.querySelectorAll("#tabelaItens tbody tr").forEach((tr) => {
    const qtd = Number(tr.querySelector(".item-quantidade").value) || 0;
    const valorUnit = Number(tr.querySelector(".item-valor-unitario").value) || 0;
    tr.querySelector(".item-valor-total").textContent = formatarMoeda(qtd * valorUnit);
  });

  const subtotal = lerItensDoFormulario().reduce((soma, i) => soma + i.quantidade * i.valorUnitario, 0);

  let totalImpostos = 0;
  document.querySelectorAll("#tabelaImpostos tbody tr").forEach((tr) => {
    const pct = Number(tr.querySelector(".imposto-percentual").value) || 0;
    const valorCalculado = subtotal * (pct / 100);
    tr.querySelector(".imposto-valor-calculado").textContent = formatarMoeda(valorCalculado);
    totalImpostos += valorCalculado;
  });

  document.getElementById("resumoSubtotal").textContent = formatarMoeda(subtotal);
  document.getElementById("resumoImpostos").textContent = formatarMoeda(totalImpostos);
  document.getElementById("resumoTotal").textContent = formatarMoeda(subtotal + totalImpostos);
}

// Cálculo próprio da NF-e, seguindo a estrutura da DANFE: Valor Total
// dos Produtos (soma dos itens) + IPI + Frete + Seguro + Outras
// Despesas − Desconto = Valor Total da Nota. (ICMS normalmente já
// vem embutido no preço do produto — é informativo, não soma por
// cima, igual na nota real que você mandou.)
function recalcularTotaisNFe() {
  document.querySelectorAll("#tabelaItens tbody tr").forEach((tr) => {
    const qtd = Number(tr.querySelector(".item-quantidade").value) || 0;
    const valorUnit = Number(tr.querySelector(".item-valor-unitario").value) || 0;
    tr.querySelector(".item-valor-total").textContent = formatarMoeda(qtd * valorUnit);
  });

  const valorProdutos = lerItensDoFormulario().reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  const ler = (id) => Number(document.getElementById(id)?.value) || 0;
  const ipi = ler("campoValorIpi");
  const frete = ler("campoValorFrete");
  const seguro = ler("campoValorSeguro");
  const outrasDespesas = ler("campoOutrasDespesas");
  const desconto = ler("campoDesconto");

  const extras = ipi + frete + seguro + outrasDespesas - desconto;
  const totalNota = valorProdutos + extras;

  document.getElementById("resumoSubtotal").textContent = formatarMoeda(valorProdutos);
  document.getElementById("resumoImpostos").textContent = formatarMoeda(extras);
  document.getElementById("resumoTotal").textContent = formatarMoeda(totalNota);
}

// Cálculo próprio da NFS-e, seguindo a estrutura da nota real:
// Valor Serviço → (- descontos - deduções) → Base de Cálculo →
// (× alíquota) → Valor ISS. Valor Líquido = Valor Serviço menos tudo
// que foi retido (INSS, IRRF, PIS/COFINS/CSLL, ISS se retido, outras).
function recalcularTotaisNFSe() {
  document.querySelectorAll("#tabelaItens tbody tr").forEach((tr) => {
    const qtd = Number(tr.querySelector(".item-quantidade").value) || 0;
    const valorUnit = Number(tr.querySelector(".item-valor-unitario").value) || 0;
    tr.querySelector(".item-valor-total").textContent = formatarMoeda(qtd * valorUnit);
  });

  const valorServico = lerItensDoFormulario().reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  const ler = (id) => Number(document.getElementById(id)?.value) || 0;
  const descCond = ler("campoDescCondicional");
  const descIncond = ler("campoDescIncondicional");
  const deducoes = ler("campoDeducoes");
  const baseCalculo = Math.max(0, valorServico - descCond - descIncond - deducoes);

  const aliqIss = ler("campoAliqIss");
  const valorIss = baseCalculo * (aliqIss / 100);
  const issRetido = document.getElementById("campoIssRetido")?.value === "SIM";

  const inss = ler("campoInssRetido");
  const irrf = ler("campoIrrfRetido");
  const pisCofinsCsll = ler("campoPisCofinsCsllRetidos");
  const outras = ler("campoOutrasRetencoes");
  const totalRetencoes = inss + irrf + pisCofinsCsll + outras + (issRetido ? valorIss : 0);

  const valorLiquido = valorServico - totalRetencoes;

  document.getElementById("resumoSubtotal").textContent = formatarMoeda(valorServico);
  const elBase = document.getElementById("resumoBaseCalculo");
  if (elBase) elBase.textContent = formatarMoeda(baseCalculo);
  const elIss = document.getElementById("resumoValorIss");
  if (elIss) elIss.textContent = formatarMoeda(valorIss);
  document.getElementById("resumoImpostos").textContent = formatarMoeda(totalRetencoes);
  document.getElementById("resumoTotal").textContent = formatarMoeda(valorLiquido);
}


// ── Preencher / limpar formulário ───────────────────────────────
function limparFormulario() {
  notaEmEdicaoId = null;
  document.getElementById("campoTomadorNome").value = "";
  document.getElementById("campoTomadorDocumento").value = "";
  document.getElementById("campoTomadorEndereco").value = "";
  document.getElementById("campoObservacoes").value = "";
  ["campoTomadorInscMunicipal", "campoTomadorInscEstadual", "campoTomadorMunicipio", "campoTomadorUf",
   "campoTomadorCep", "campoTomadorFone", "campoTomadorEmail"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const campoPais = document.getElementById("campoTomadorPais");
  if (campoPais) campoPais.value = "Brasil";

  document.querySelector("#tabelaItens tbody").innerHTML = "";
  adicionarLinhaItem();

  const tabelaImpostosEl = document.querySelector("#tabelaImpostos tbody");
  if (tabelaImpostosEl) {
    tabelaImpostosEl.innerHTML = "";
    (IMPOSTOS_PADRAO[TIPO_NOTA_PAGINA] || []).forEach((i) => adicionarLinhaImposto(i));
  }

  if (TIPO_NOTA_PAGINA === "NFS-e") limparCamposEstruturadosNFSe();
  if (TIPO_NOTA_PAGINA === "NF-e") limparCamposEstruturadosNFe();

  recalcularTotais();
  document.getElementById("tituloFormulario").textContent = `Nova ${TIPO_NOTA_PAGINA}`;
}

// Todos os campos estruturados novos (ISSQN, IBS/CBS, Impostos
// Federais, Descontos) — zera pra um formulário em branco.
const IDS_CAMPOS_ESTRUTURADOS_NFSE = [
  "campoTomadorInscMunicipal", "campoTomadorInscEstadual",
  "campoCompetencia", "campoLocalPrestacao", "campoMunicipioIncidencia", "campoAliqIss",
  "campoTipoOperacao", "campoIndicadorOperacao", "campoNbs", "campoClassificacaoTributaria", "campoCst", "campoCreditoPresumido",
  "campoValorBcIbs", "campoVlrTotIbs", "campoVlrIbsUf", "campoAliqIbsUf", "campoAliqEfIbsUf",
  "campoVlrIbsMun", "campoAliqIbsMun", "campoAliqEfIbsMun", "campoValorCbs", "campoAliqCbs", "campoAliqEfCbs",
  "campoInssRetido", "campoIrrfRetido", "campoPisCofinsCsllRetidos", "campoCofinsDevido", "campoPisDevido",
  "campoRetFederais", "campoRetEstaduais", "campoRetMunicipais", "campoOutrasRetencoes",
  "campoDescCondicional", "campoDescIncondicional", "campoDeducoes",
];
function limparCamposEstruturadosNFSe() {
  IDS_CAMPOS_ESTRUTURADOS_NFSE.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = el.type === "number" ? "0" : "";
  });
  const selects = ["campoNaturezaOperacao", "campoIssRetido", "campoFinalidade", "campoEnteGovernamental", "campoDestinatario", "campoUsoConsumoPessoal"];
  selects.forEach((id) => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });

  // Local de Prestação e Município de Incidência: quase sempre
  // Curitiba, na prática da FNX DEV — evita começar em branco toda
  // vez numa nota nova.
  const campoLocal = document.getElementById("campoLocalPrestacao");
  const campoIncidencia = document.getElementById("campoMunicipioIncidencia");
  if (campoLocal) campoLocal.value = "Curitiba/PR";
  if (campoIncidencia) campoIncidencia.value = "Curitiba/PR";
}

// Mesma ideia, pro lado da NF-e — Destinatário completo, Cálculo do
// Imposto, Transportador, Retenções.
const IDS_CAMPOS_ESTRUTURADOS_NFE = [
  "campoTomadorInscEstadual", "campoTomadorBairro", "campoTomadorMunicipio", "campoTomadorUf",
  "campoTomadorCep", "campoTomadorFone", "campoDataEmissao", "campoDataSaidaEntrada", "campoHoraSaida", "campoFaturaDuplicatas",
  "campoBcIcms", "campoValorIcms", "campoBcIcmsSt", "campoValorIcmsSt", "campoValorIpi",
  "campoValorFrete", "campoValorSeguro", "campoDesconto", "campoOutrasDespesas", "campoValorPis", "campoValorCofins",
  "campoTransportadorRazaoSocial", "campoTransportadorCnpj", "campoTransportadorCodigoAntt", "campoTransportadorPlaca", "campoTransportadorUf",
  "campoTransportadorEndereco", "campoTransportadorMunicipio", "campoTransportadorEnderecoUf", "campoTransportadorInscEstadual",
  "campoQuantidadeVolumes", "campoEspecieVolumes", "campoMarcaVolumes", "campoNumeracaoVolumes", "campoPesoBruto", "campoPesoLiquido",
  "campoRetPis", "campoRetCofins", "campoRetCsll", "campoRetIrrf", "campoRetInss", "campoRetIss",
];
function limparCamposEstruturadosNFe() {
  IDS_CAMPOS_ESTRUTURADOS_NFE.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = el.type === "number" ? "0" : "";
  });
  const selects = ["campoNaturezaOperacao", "campoFretePorContaDe"];
  selects.forEach((id) => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
}

function preencherFormulario(nota) {
  notaEmEdicaoId = nota.id;
  document.getElementById("campoTomadorNome").value = nota.tomadorNome || "";
  document.getElementById("campoTomadorDocumento").value = nota.tomadorDocumento || "";
  document.getElementById("campoTomadorEndereco").value = nota.tomadorEndereco || "";
  document.getElementById("campoObservacoes").value = nota.observacoes || "";
  [["campoTomadorInscMunicipal", "tomadorInscMunicipal"], ["campoTomadorInscEstadual", "tomadorInscEstadual"],
   ["campoTomadorBairro", "tomadorBairro"], ["campoTomadorMunicipio", "tomadorMunicipio"], ["campoTomadorUf", "tomadorUf"], ["campoTomadorCep", "tomadorCep"],
   ["campoTomadorPais", "tomadorPais"], ["campoTomadorFone", "tomadorFone"], ["campoTomadorEmail", "tomadorEmail"]]
    .forEach(([idCampo, chave]) => { const el = document.getElementById(idCampo); if (el) el.value = nota[chave] || (idCampo === "campoTomadorPais" ? "Brasil" : ""); });

  if (TIPO_NOTA_PAGINA === "NFS-e") {
    limparCamposEstruturadosNFSe();
    Object.entries(nota.dadosEstruturados || {}).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  }
  if (TIPO_NOTA_PAGINA === "NF-e") {
    limparCamposEstruturadosNFe();
    Object.entries(nota.dadosEstruturados || {}).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor;
    });
  }

  document.querySelector("#tabelaItens tbody").innerHTML = "";
  (nota.itens && nota.itens.length ? nota.itens : [{}]).forEach((i) => adicionarLinhaItem(i));

  const tabelaImpostosEl = document.querySelector("#tabelaImpostos tbody");
  if (tabelaImpostosEl) {
    tabelaImpostosEl.innerHTML = "";
    (nota.impostos && nota.impostos.length ? nota.impostos : (IMPOSTOS_PADRAO[TIPO_NOTA_PAGINA] || [])).forEach((i) => adicionarLinhaImposto(i));
  }

  recalcularTotais();
  document.getElementById("tituloFormulario").textContent = `Editando ${TIPO_NOTA_PAGINA} — ${nota.tomadorNome}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Preenchimento vindo de uma proposta aceita (via propostas-core.js),
// passado pela URL como JSON codificado em base64 no parâmetro "dados".
function tentarPreencherAPartirDaUrl() {
  const params = new URLSearchParams(window.location.search);
  const dadosCodificados = params.get("dados");
  if (!dadosCodificados) return;
  try {
    const dados = JSON.parse(decodeURIComponent(escape(atob(dadosCodificados))));
    preencherFormulario({
      tomadorNome: dados.cliente || "",
      tomadorDocumento: "",
      tomadorEndereco: dados.local || "",
      observacoes: dados.observacao || "",
      itens: dados.itens || [],
      propostaId: dados.propostaId || null,
    });
    if (dados.propostaId) {
      const campoOculto = document.getElementById("campoPropostaId");
      if (campoOculto) campoOculto.value = dados.propostaId;
    }
  } catch (e) {
    console.warn("[nota-fiscal] Não foi possível ler os dados da proposta na URL:", e);
  }
}

// ── Salvar rascunho ──────────────────────────────────────────────
async function salvarRascunho() {
  const tomadorNome = document.getElementById("campoTomadorNome").value.trim();
  if (!tomadorNome) { mostrarToast("Informe o cliente/tomador.", "erro"); return; }

  const itens = lerItensDoFormulario().filter((i) => i.descricao);
  if (itens.length === 0) { mostrarToast("Adicione pelo menos um item.", "erro"); return; }

  const botao = document.getElementById("btnSalvarRascunho");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Salvando...";

  try {
    const dados = {
      id: notaEmEdicaoId,
      tipo: TIPO_NOTA_PAGINA,
      propostaId: document.getElementById("campoPropostaId")?.value || null,
      tomadorNome,
      tomadorDocumento: document.getElementById("campoTomadorDocumento").value.trim(),
      tomadorEndereco: document.getElementById("campoTomadorEndereco").value.trim(),
      tomadorInscMunicipal: document.getElementById("campoTomadorInscMunicipal")?.value.trim() || "",
      tomadorInscEstadual: document.getElementById("campoTomadorInscEstadual")?.value.trim() || "",
      tomadorBairro: document.getElementById("campoTomadorBairro")?.value.trim() || "",
      tomadorMunicipio: document.getElementById("campoTomadorMunicipio")?.value.trim() || "",
      tomadorUf: document.getElementById("campoTomadorUf")?.value.trim() || "",
      tomadorCep: document.getElementById("campoTomadorCep")?.value.trim() || "",
      tomadorPais: document.getElementById("campoTomadorPais")?.value.trim() || "",
      tomadorFone: document.getElementById("campoTomadorFone")?.value.trim() || "",
      tomadorEmail: document.getElementById("campoTomadorEmail")?.value.trim() || "",
      itens,
      impostos: document.querySelector("#tabelaImpostos") ? lerImpostosDoFormulario().filter((i) => i.nome) : [],
      observacoes: document.getElementById("campoObservacoes").value.trim(),
      status: "rascunho",
    };
    if (TIPO_NOTA_PAGINA === "NFS-e") {
      dados.dadosEstruturados = {};
      IDS_CAMPOS_ESTRUTURADOS_NFSE.concat(["campoNaturezaOperacao", "campoIssRetido", "campoFinalidade", "campoEnteGovernamental", "campoDestinatario", "campoUsoConsumoPessoal"]).forEach((id) => {
        const el = document.getElementById(id);
        if (el) dados.dadosEstruturados[id] = el.value;
      });
    }
    if (TIPO_NOTA_PAGINA === "NF-e") {
      dados.dadosEstruturados = {};
      IDS_CAMPOS_ESTRUTURADOS_NFE.concat(["campoNaturezaOperacao", "campoFretePorContaDe"]).forEach((id) => {
        const el = document.getElementById(id);
        if (el) dados.dadosEstruturados[id] = el.value;
      });
    }
    const resposta = await apiSalvarNotaFiscal(dados);
    if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao salvar.", "erro"); return; }
    mostrarToast("Rascunho salvo.");
    limparFormulario();
    carregarNotas();
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// ── "Emitir" — hoje mostra claramente que falta o certificado ──────
async function tentarEmitir() {
  // Primeiro salva como rascunho, garantindo que os dados não se percam
  // mesmo a emissão de verdade ainda não sendo possível.
  await salvarRascunhoSilencioso();

  const resposta = await apiEmitirNotaFiscal(notaEmEdicaoId);
  if (!resposta.ok) {
    mostrarToast(resposta.erro || "Não foi possível emitir a nota.", "erro");
    return;
  }
  // (quando o certificado estiver configurado, este caminho vai
  // efetivamente emitir e mostrar o número da nota, protocolo, etc.)
  mostrarToast("Nota emitida com sucesso!");
  limparFormulario();
  carregarNotas();
}

// ── Cancelamento — exige motivo/justificativa ──────────────────
async function tentarCancelar(notaId, nomeTomador) {
  const motivo = prompt(`Motivo do cancelamento de "${nomeTomador}":\n\n(campo obrigatório — a SEFAZ/prefeitura exige uma justificativa pra aceitar o cancelamento)`);
  if (motivo === null) return; // cancelou o prompt, não faz nada
  if (!motivo.trim()) {
    mostrarToast("É obrigatório informar o motivo do cancelamento.", "erro");
    return;
  }

  const resposta = await apiCancelarNotaFiscal(notaId, motivo);
  if (!resposta.ok) {
    mostrarToast(resposta.erro || "Não foi possível cancelar a nota.", "erro");
    return;
  }
  // (quando a integração real estiver pronta, este caminho vai de fato
  // enviar o evento de cancelamento pra SEFAZ/prefeitura)
  mostrarToast("Nota cancelada com sucesso!");
  carregarNotas();
}

async function salvarRascunhoSilencioso() {
  const tomadorNome = document.getElementById("campoTomadorNome").value.trim();
  if (!tomadorNome) return;
  const dados = {
    id: notaEmEdicaoId,
    tipo: TIPO_NOTA_PAGINA,
    propostaId: document.getElementById("campoPropostaId")?.value || null,
    tomadorNome,
    tomadorDocumento: document.getElementById("campoTomadorDocumento").value.trim(),
    tomadorEndereco: document.getElementById("campoTomadorEndereco").value.trim(),
    itens: lerItensDoFormulario().filter((i) => i.descricao),
    impostos: lerImpostosDoFormulario().filter((i) => i.nome),
    observacoes: document.getElementById("campoObservacoes").value.trim(),
    status: "rascunho",
  };
  const resposta = await apiSalvarNotaFiscal(dados);
  if (resposta.ok) notaEmEdicaoId = resposta.id;
}

// ── Lista de rascunhos/notas salvas ──────────────────────────────
async function carregarNotas() {
  const resposta = await apiListarNotasFiscais();
  if (!resposta.ok) { mostrarToast(resposta.erro || "Erro ao carregar notas.", "erro"); return; }
  // Só mostra RASCUNHOS (ainda não emitidas) — notas emitidas OU
  // canceladas (que já foram emitidas em algum momento) passam a
  // aparecer só na Consulta.
  notasCache = resposta.notas.filter((n) => n.tipo === TIPO_NOTA_PAGINA && n.status !== "emitida" && n.status !== "cancelada");
  renderizarListaNotas();
}

function renderizarListaNotas() {
  const lista = document.getElementById("listaNotas");
  const vazio = document.getElementById("vazioNotas");
  lista.innerHTML = "";

  if (notasCache.length === 0) {
    vazio.style.display = "block";
    return;
  }
  vazio.style.display = "none";

  notasCache.forEach((nota) => {
    const subtotal = (nota.itens || []).reduce((s, i) => s + (i.quantidade || 0) * (i.valorUnitario || 0), 0);
    const totalImpostos = (nota.impostos || []).reduce((s, i) => s + subtotal * ((i.percentual || 0) / 100), 0);

    const el = document.createElement("div");
    el.className = "item-nota-fiscal";
    const motivoLinha = nota.motivoCancelamento ? `<div class="meta">Motivo: ${escaparHtml(nota.motivoCancelamento)}</div>` : "";
    el.innerHTML = `
      <div>
        <div class="nome-tomador">${escaparHtml(nota.tomadorNome)} <span class="badge-status ${nota.status}">${nota.status}</span></div>
        <div class="meta">${(nota.itens || []).length} item(ns) · ${new Date(nota.atualizadoEm || nota.criadoEm).toLocaleString("pt-BR")}</div>
        ${motivoLinha}
      </div>
      <div class="valor">${formatarMoeda(subtotal + totalImpostos)}</div>
      <div class="acoes">
        <button class="btn-abrir-nota">Abrir</button>
        ${nota.status === "emitida" ? '<button class="btn-cancelar-nota">Cancelar</button>' : ""}
        <button class="btn-excluir-nota">Excluir</button>
      </div>
    `;
    el.querySelector(".btn-abrir-nota").addEventListener("click", () => preencherFormulario(nota));
    const btnCancelar = el.querySelector(".btn-cancelar-nota");
    if (btnCancelar) {
      btnCancelar.addEventListener("click", (ev) => {
        ev.stopPropagation();
        tentarCancelar(nota.id, nota.tomadorNome);
      });
    }
    el.querySelector(".btn-excluir-nota").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const ok = await confirmarAcao(`Excluir esta ${TIPO_NOTA_PAGINA} de "${nota.tomadorNome}"?`, "");
      if (!ok) return;
      const resp = await apiExcluirNotaFiscal(nota.id);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Excluída.");
      carregarNotas();
    });
    lista.appendChild(el);
  });
}

// ── Inicialização ────────────────────────────────────────────────
document.getElementById("btnAddItem").addEventListener("click", () => adicionarLinhaItem());
if (document.getElementById("btnAddImposto")) {
  document.getElementById("btnAddImposto").addEventListener("click", () => adicionarLinhaImposto());
}
document.getElementById("btnSalvarRascunho").addEventListener("click", salvarRascunho);
document.getElementById("btnEmitir").addEventListener("click", tentarEmitir);
document.getElementById("btnNovaNota").addEventListener("click", limparFormulario);
document.getElementById("campoTomadorNome").addEventListener("change", tentarAutopreencherTomador);

// Todo campo estruturado novo da NFS-e recalcula o resumo de valores
// ao mudar — os mesmos IDs usados pra limpar/preencher o formulário.
if (TIPO_NOTA_PAGINA === "NFS-e") {
  IDS_CAMPOS_ESTRUTURADOS_NFSE.concat(["campoIssRetido"]).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", recalcularTotais);
  });
  carregarDadosEmpresa();

  // Município de Incidência copia o Local de Prestação automaticamente
  // — na prática da FNX DEV, só muda quando o serviço é fora de
  // Curitiba, então copiar poupa digitar duas vezes o mesmo lugar.
  const campoLocal = document.getElementById("campoLocalPrestacao");
  const campoIncidencia = document.getElementById("campoMunicipioIncidencia");
  if (campoLocal && campoIncidencia) {
    campoLocal.addEventListener("input", () => { campoIncidencia.value = campoLocal.value; });
  }
}
if (TIPO_NOTA_PAGINA === "NF-e") {
  IDS_CAMPOS_ESTRUTURADOS_NFE.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", recalcularTotais);
  });
  carregarDadosEmpresa();
}

limparFormulario();
tentarPreencherAPartirDaUrl();
carregarNotas();
carregarAutocompleteContatos();
carregarAutocompleteMateriais();