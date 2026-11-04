// ============================================================
// fiscal-cadastro.js — campos fiscais completos no cadastro de
// Material e de Serviço (Mão de Obra), e o cadastro de GRUPOS
// TRIBUTÁRIOS (usado pelos dois). Tela: Materiais e Serviços.
//
// Os campos são colocados dentro das janelas que já existem; quem
// salva continua sendo gestaodematerial.js / servicos.js, que chamam
// lerFiscalMaterial()/lerFiscalServico() e guardam em "fiscal".
//
// ⚠️ Códigos fiscais (NCM, CST, cClassTrib...) devem ser conferidos
// com a contadora antes de emitir nota. As listas aqui são ajuda
// pra preencher, não substituem a conferência.
// ============================================================

// Lista de serviços da LC 116/2003 (descrições resumidas). O texto
// oficial completo está no link "Ver lista oficial".
const LISTA_LC116 = `1.01|Análise e desenvolvimento de sistemas
1.02|Programação
1.03|Processamento e hospedagem de dados
1.04|Elaboração de programas de computador
1.05|Licenciamento de uso de software
1.06|Assessoria e consultoria em informática
1.07|Suporte técnico em informática
1.08|Criação e manutenção de páginas eletrônicas
1.09|Disponibilização de conteúdo pela internet
2.01|Pesquisa e desenvolvimento
3.02|Cessão de direito de uso de marcas
3.03|Exploração de salões de festas e eventos
3.04|Locação de ferrovia, rodovia, postes e dutos
3.05|Cessão de andaimes, palcos e coberturas
4.01|Medicina e biomedicina
4.02|Análises clínicas e diagnóstico por imagem
4.03|Hospitais, clínicas e laboratórios
4.04|Instrumentação cirúrgica
4.05|Acupuntura
4.06|Enfermagem
4.07|Serviços farmacêuticos
4.08|Terapia ocupacional, fisioterapia e fonoaudiologia
4.09|Terapias de tratamento físico e mental
4.10|Nutrição
4.11|Obstetrícia
4.12|Odontologia
4.13|Ortóptica
4.14|Próteses sob encomenda
4.15|Psicanálise
4.16|Psicologia
4.17|Casas de repouso, creches e asilos
4.18|Inseminação artificial e fertilização
4.19|Bancos de sangue, leite, óvulos e sêmen
4.20|Coleta de sangue e materiais biológicos
4.21|Atendimento e tratamento móvel
4.22|Planos de medicina de grupo e convênios
4.23|Outros planos de saúde
5.01|Medicina veterinária e zootecnia
5.02|Hospitais e clínicas veterinárias
5.03|Laboratórios de análise veterinária
5.04|Inseminação artificial veterinária
5.05|Bancos de sangue e órgãos veterinários
5.06|Coleta de materiais biológicos de animais
5.07|Atendimento veterinário móvel
5.08|Guarda, adestramento e embelezamento de animais
5.09|Planos de assistência veterinária
6.01|Barbearia, cabeleireiros e manicure
6.02|Esteticistas, tratamento de pele e depilação
6.03|Banhos, duchas, sauna e massagens
6.04|Ginástica, dança, esportes e natação
6.05|Centros de emagrecimento e spa
6.06|Tatuagens e piercings
7.01|Engenharia, arquitetura e agronomia
7.02|Execução de obras de construção civil (inclui instalação e montagem)
7.03|Planos diretores, projetos e estudos de viabilidade
7.04|Demolição
7.05|Reparação, conservação e reforma de edifícios, estradas, pontes e portos
7.06|Colocação e instalação de tapetes, carpetes, pisos e revestimentos
7.07|Recuperação, raspagem, polimento e lustração de pisos
7.08|Calafetação
7.09|Varrição, coleta, remoção e destinação de lixo
7.10|Limpeza, manutenção e conservação de vias e imóveis
7.11|Decoração e jardinagem, inclusive corte e poda de árvores
7.12|Controle e tratamento de efluentes
7.13|Dedetização, desinfecção, desratização e congêneres
7.16|Florestamento, plantio e colheita
7.17|Escoramento e contenção de encostas
7.18|Limpeza e dragagem de rios, portos e canais
7.19|Acompanhamento e fiscalização de obras de engenharia
7.20|Aerofotogrametria, cartografia e topografia
7.21|Pesquisa, perfuração e exploração de petróleo e gás
7.22|Nucleação e bombardeamento de nuvens
8.01|Ensino regular (pré-escolar a superior)
8.02|Instrução, treinamento e avaliação
9.01|Hospedagem (hotéis, flats e congêneres)
9.02|Agenciamento de turismo e excursões
9.03|Guias de turismo
10.01|Corretagem de câmbio, seguros e planos
10.02|Corretagem de títulos e contratos
10.03|Corretagem de propriedade industrial
10.04|Corretagem de leasing e franquia
10.05|Corretagem de bens móveis e imóveis
10.06|Agenciamento marítimo
10.07|Agenciamento de notícias
10.08|Agenciamento de publicidade e propaganda
10.09|Representação comercial
10.10|Distribuição de bens de terceiros
11.01|Guarda e estacionamento de veículos
11.02|Vigilância, segurança e monitoramento
11.03|Escolta de veículos e cargas
11.04|Armazenamento, depósito e guarda de bens
11.05|Monitoramento e rastreamento a distância
12.01|Espetáculos teatrais
12.02|Exibições cinematográficas
12.03|Espetáculos circenses
12.04|Programas de auditório
12.05|Parques de diversões e centros de lazer
12.06|Boates e taxi-dancing
12.07|Shows, danças, óperas e concertos
12.08|Feiras, exposições e congressos
12.09|Bilhares, boliches e diversões eletrônicas
12.10|Corridas e competições de animais
12.11|Competições esportivas
12.12|Execução de música
12.13|Produção de eventos e espetáculos
12.14|Fornecimento de música para ambientes
12.15|Desfiles de blocos e trios elétricos
12.16|Exibição de shows e espetáculos
12.17|Recreação e animação de festas
13.02|Fonografia e gravação de sons
13.03|Fotografia e cinematografia
13.04|Reprografia, microfilmagem e digitalização
13.05|Composição gráfica e impressos
14.01|Lubrificação, limpeza, revisão e conserto de máquinas e equipamentos
14.02|Assistência técnica
14.03|Recondicionamento de motores
14.04|Recauchutagem de pneus
14.05|Beneficiamento, pintura e acabamento de objetos
14.06|Instalação e montagem de aparelhos, máquinas e equipamentos
14.07|Colocação de molduras
14.08|Encadernação e douração de livros
14.09|Alfaiataria e costura
14.10|Tinturaria e lavanderia
14.11|Tapeçaria e reforma de estofados
14.12|Funilaria e lanternagem
14.13|Carpintaria e serralheria
14.14|Guincho, guindaste e içamento
15.01|Administração de fundos, consórcio e cartões
15.02|Abertura de contas em geral
15.03|Locação de cofres e terminais
15.04|Fornecimento e emissão de atestados
15.05|Cadastro e ficha cadastral (CCF)
15.06|Emissão de avisos e documentos bancários
15.07|Acesso e movimentação de contas
15.08|Registro de contrato de crédito
15.09|Arrendamento mercantil (leasing)
15.10|Cobranças, recebimentos e pagamentos
15.11|Devolução e protesto de títulos
15.12|Custódia de títulos e valores
15.13|Operações de câmbio
15.14|Fornecimento de cartões magnéticos
15.15|Compensação de cheques e saques
15.16|Ordens de pagamento e de crédito
15.17|Emissão e sustação de cheques
15.18|Crédito imobiliário e vistoria de imóvel
16.01|Transporte coletivo municipal
16.02|Outros transportes de natureza municipal
17.01|Assessoria e consultoria em geral
17.02|Digitação, secretaria e expediente
17.03|Planejamento e organização técnica
17.04|Recrutamento e seleção de mão de obra
17.05|Fornecimento de mão de obra
17.06|Propaganda e publicidade
17.08|Franquia (franchising)
17.09|Perícias, laudos e exames técnicos
17.10|Organização de feiras e congressos
17.11|Organização de festas e bufê
17.12|Administração de bens e negócios
17.13|Leilão
17.14|Advocacia
17.15|Arbitragem
17.16|Auditoria
17.17|Análise de organização e métodos
17.18|Atuária e cálculos técnicos
17.19|Contabilidade
17.20|Consultoria econômica ou financeira
17.21|Estatística
17.22|Cobrança em geral
17.23|Assessoria e gerenciamento de informações
17.24|Palestras, conferências e seminários
17.25|Inserção de propaganda e publicidade
18.01|Regulação de sinistros e avaliação de riscos
19.01|Venda de bilhetes de loteria e apostas
20.01|Serviços portuários
20.02|Serviços aeroportuários
20.03|Serviços de terminais rodoviários
21.01|Registros públicos, cartorários e notariais
22.01|Exploração de rodovia (pedágio)
23.01|Programação e comunicação visual
24.01|Chaveiros, carimbos e placas
25.01|Funerais
25.02|Translado e cremação de corpos
25.03|Planos ou convênios funerários
25.04|Manutenção de jazigos e cemitérios
25.05|Cessão de espaços em cemitérios
26.01|Coleta e entrega de correspondências
27.01|Assistência social
28.01|Avaliação de bens e serviços
29.01|Biblioteconomia
30.01|Biologia, biotecnologia e química
31.01|Serviços técnicos em edificações e eletrônica
32.01|Desenhos técnicos
33.01|Desembaraço aduaneiro e despachantes
34.01|Investigações particulares e detetives
35.01|Reportagem, jornalismo e relações públicas
36.01|Meteorologia
37.01|Artistas, atletas, modelos e manequins
38.01|Museologia
39.01|Ourivesaria e lapidação
40.01|Obras de arte sob encomenda`.split("\n").map((l) => {
  const [cod, desc] = l.split("|");
  const [a, b] = cod.split(".");
  return { codigo: `${a.padStart(2, "0")}.${b}`, descricao: desc };
});

const LINKS_FISCAIS = {
  lc116: "https://buscadorncm.com.br/lc116",
  nbs: "https://buscadorncm.com.br/nbs",
  nbsOficial: "https://www.gov.br/mdic/pt-br/assuntos/sdic/comercio-e-servicos/nbs-nomenclatura-brasileira-de-servicos",
  ncm: "https://portalunico.siscomex.gov.br/classif/#/sumario?perfil=publico",
  ncmAlt: "https://buscadorncm.com.br/",
};

const OPCOES_EXIGIBILIDADE_ISS = [
  ["1", "1 — Exigível"], ["2", "2 — Não incidência"], ["3", "3 — Isenção"], ["4", "4 — Exportação"],
  ["5", "5 — Imunidade"], ["6", "6 — Suspensa por decisão judicial"], ["7", "7 — Suspensa por processo administrativo"],
];
const OPCOES_CST_PIS_COFINS = [
  ["01", "01 — Tributável, alíquota básica"], ["02", "02 — Tributável, alíquota diferenciada"],
  ["03", "03 — Tributável por unidade de medida"], ["04", "04 — Monofásica, revenda a alíquota zero"],
  ["05", "05 — Substituição tributária"], ["06", "06 — Alíquota zero"], ["07", "07 — Isenta"],
  ["08", "08 — Sem incidência"], ["09", "09 — Suspensão"], ["49", "49 — Outras operações de saída"],
  ["99", "99 — Outras operações"],
];
const OPCOES_IGNORAR_TRIBUTOS = [
  ["nao", "Não ignorar tributos"],
  ["todos", "Ignorar todos os tributos"],
  ["credito", "Ignorar tributos de crédito tributário"],
];

const escF = (t) => (typeof escaparHtml === "function" ? escaparHtml(t) : String(t === undefined || t === null ? "" : t));
const opcoesHtml = (lista, valor, vazio) =>
  (vazio ? `<option value="">${vazio}</option>` : "") +
  lista.map(([v, r]) => `<option value="${v}"${String(valor) === v ? " selected" : ""}>${r}</option>`).join("");

// ====================================================
// GRUPOS TRIBUTÁRIOS — cache e servidor
// ====================================================
let gruposTributariosCache = [];
async function carregarGruposTributarios() {
  const r = await chamarWorker("grupos-trib-list");
  if (r.ok) gruposTributariosCache = r.grupos || [];
  atualizarSelectsGrupoTributario();
  renderListaGruposTributarios();
  return gruposTributariosCache;
}
function rotuloGrupoTributario(g) {
  return `${g.codigoInterno ? g.codigoInterno + " — " : ""}${g.descricao || "(sem descrição)"}`;
}
function atualizarSelectsGrupoTributario() {
  document.querySelectorAll("select.select-grupo-trib").forEach((sel) => {
    const atual = sel.value || sel.dataset.valor || "";
    const tipo = sel.dataset.tipo; // "material" | "servico"
    const grupos = gruposTributariosCache.filter((g) => !g.aplicaEm || g.aplicaEm === "ambos" || g.aplicaEm === tipo);
    sel.innerHTML = `<option value="">— Nenhum —</option>` + grupos.map((g) => `<option value="${escF(g.id)}">${escF(rotuloGrupoTributario(g))}</option>`).join("");
    sel.value = atual;
    if (atual && sel.value !== atual) sel.dataset.valor = atual; // ainda carregando
  });
}

// ====================================================
// CAMPOS EXTRAS NO CADASTRO DE MATERIAL
// ====================================================
function montarCamposFiscaisMaterial() {
  const form = document.getElementById("form-material");
  if (!form || document.getElementById("blocoFiscalMaterial")) return;
  // NCM com botão de busca
  const ncm = document.getElementById("ncmMaterial");
  if (ncm) {
    const linha = document.createElement("div");
    linha.className = "campo-com-busca";
    ncm.parentNode.insertBefore(linha, ncm);
    linha.appendChild(ncm);
    linha.insertAdjacentHTML("beforeend", `<a class="btn-busca-fiscal" href="${LINKS_FISCAIS.ncm}" target="_blank" rel="noopener" title="Pesquisar o NCM no site oficial (Siscomex)">🔎 Buscar NCM</a>`);
  }
  // "Unidade" passa a se chamar Unidade comercial
  const unid = document.getElementById("unidadeMaterial");
  if (unid) {
    const rot = unid.closest("label").querySelector(".rotulo-com-opcional");
    if (rot) rot.innerHTML = 'Unidade comercial <span class="texto-opcional">(como é vendido)</span>';
  }
  const extras = document.getElementById("listaCamposExtrasMaterial").closest(".campo-largura-total");
  const bloco = document.createElement("div");
  bloco.className = "campo-largura-total bloco-fiscal";
  bloco.id = "blocoFiscalMaterial";
  bloco.innerHTML = `
    <div class="titulo-bloco-fiscal">🧾 Mais dados para a NF-e</div>
    <div class="grade-fiscal">
      <label>Grupo tributário
        <select id="fiscMatGrupo" class="select-grupo-trib" data-tipo="material"></select>
      </label>
      <label>Ignorar tributos no preço de compra/venda
        <select id="fiscMatIgnorar">${opcoesHtml(OPCOES_IGNORAR_TRIBUTOS, "nao")}</select>
      </label>
      <label><span class="rotulo-com-opcional">Peso líquido unitário (kg) <span class="texto-opcional">(opcional)</span></span>
        <input type="text" inputmode="decimal" id="fiscMatPesoLiq" placeholder="0,000" />
      </label>
      <label><span class="rotulo-com-opcional">Peso bruto unitário (kg) <span class="texto-opcional">(opcional)</span></span>
        <input type="text" inputmode="decimal" id="fiscMatPesoBruto" placeholder="0,000" />
      </label>
      <label><span class="rotulo-com-opcional">Exceção da tabela IPI (EX TIPI) <span class="texto-opcional">(opcional)</span></span>
        <input type="text" id="fiscMatExTipi" maxlength="3" placeholder="ex: 01" />
      </label>
      <label><span class="rotulo-com-opcional">Código Benef. Fiscal na UF (cBenef) <span class="texto-opcional">(opcional)</span></span>
        <input type="text" id="fiscMatCBenef" maxlength="10" placeholder="ex: PR800001" />
      </label>
      <div class="linha-chave campo-largura-total">
        <label class="chave"><input type="checkbox" id="fiscMatUnidTribDif" /><span class="trilho"></span></label>
        <span>Unidade tributável diferente da comercial</span>
      </div>
      <label class="so-unid-trib" style="display:none;">Unidade tributável
        <input type="text" id="fiscMatUnidTrib" placeholder="ex: KG, M2, UN" />
      </label>
      <label class="so-unid-trib" style="display:none;">Quantas unidades tributáveis em 1 comercial
        <input type="text" inputmode="decimal" id="fiscMatFatorTrib" placeholder="ex: 20 (saco de 20 kg)" />
      </label>
      <label class="campo-largura-total">Informações adicionais para a NF-e
        <textarea id="fiscMatInfAdic" rows="2" placeholder="Anotações que vão no campo de informações adicionais do item na nota"></textarea>
      </label>
    </div>`;
  extras.parentNode.insertBefore(bloco, extras);
  const chave = document.getElementById("fiscMatUnidTribDif");
  const alternar = () => bloco.querySelectorAll(".so-unid-trib").forEach((el) => { el.style.display = chave.checked ? "" : "none"; });
  chave.addEventListener("change", alternar);
  bloco._alternarUnidTrib = alternar;
  atualizarSelectsGrupoTributario();
}

function lerFiscalMaterial() {
  const v = (id) => (document.getElementById(id)?.value || "").trim();
  return {
    grupoTributarioId: v("fiscMatGrupo"),
    ignorarTributos: v("fiscMatIgnorar") || "nao",
    pesoLiquido: v("fiscMatPesoLiq"),
    pesoBruto: v("fiscMatPesoBruto"),
    exTipi: v("fiscMatExTipi"),
    cBenef: v("fiscMatCBenef").toUpperCase(),
    unidadeTributavelDiferente: !!document.getElementById("fiscMatUnidTribDif")?.checked,
    unidadeTributavel: v("fiscMatUnidTrib").toUpperCase(),
    fatorTributavel: v("fiscMatFatorTrib"),
    infAdicionaisNfe: v("fiscMatInfAdic"),
  };
}
function preencherFiscalMaterial(f) {
  f = f || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val === undefined || val === null ? "" : val; };
  const sel = document.getElementById("fiscMatGrupo");
  if (sel) { sel.dataset.valor = f.grupoTributarioId || ""; sel.value = f.grupoTributarioId || ""; }
  set("fiscMatIgnorar", f.ignorarTributos || "nao");
  set("fiscMatPesoLiq", f.pesoLiquido);
  set("fiscMatPesoBruto", f.pesoBruto);
  set("fiscMatExTipi", f.exTipi);
  set("fiscMatCBenef", f.cBenef);
  const chave = document.getElementById("fiscMatUnidTribDif");
  if (chave) chave.checked = !!f.unidadeTributavelDiferente;
  set("fiscMatUnidTrib", f.unidadeTributavel);
  set("fiscMatFatorTrib", f.fatorTributavel);
  set("fiscMatInfAdic", f.infAdicionaisNfe);
  const bloco = document.getElementById("blocoFiscalMaterial");
  if (bloco && bloco._alternarUnidTrib) bloco._alternarUnidTrib();
}

// ====================================================
// CAMPOS EXTRAS NO CADASTRO DE SERVIÇO (MÃO DE OBRA)
// ====================================================
function montarCamposFiscaisServico() {
  const lc = document.getElementById("campoCodigoLC116");
  if (!lc || document.getElementById("blocoFiscalServico")) return;
  // LC 116 com busca: digita "pintura", "reforma", "7.05"...
  const dl = document.createElement("datalist");
  dl.id = "listaLc116Datalist";
  dl.innerHTML = LISTA_LC116.map((i) => `<option value="${i.codigo}">${escF(i.codigo + " — " + i.descricao)}</option>`).join("");
  document.body.appendChild(dl);
  lc.setAttribute("list", "listaLc116Datalist");
  lc.setAttribute("placeholder", "Digite o código ou a palavra (ex: reforma)");
  const rotLc = lc.closest("label");
  rotLc.classList.add("campo-largura-total");
  rotLc.firstChild.textContent = "Código de Serviço (LC 116) ";
  const ajuda = document.createElement("div");
  ajuda.className = "ajuda-lc116";
  ajuda.id = "ajudaLc116";
  rotLc.appendChild(ajuda);
  const buscaLc = document.createElement("div");
  buscaLc.className = "resultados-lc116";
  buscaLc.id = "resultadosLc116";
  rotLc.appendChild(buscaLc);
  const mostrarDescricao = () => {
    const cod = normalizarCodigoLc116(lc.value);
    const item = LISTA_LC116.find((i) => i.codigo === cod);
    ajuda.innerHTML = item ? `✔ ${escF(item.descricao)}` : (lc.value.trim() ? "" : `<a href="${LINKS_FISCAIS.lc116}" target="_blank" rel="noopener">Ver lista oficial completa</a>`);
    // Busca por palavra (o datalist só acha pelo começo do texto em alguns navegadores)
    const termo = semAcentoF(lc.value.trim());
    const resultados = termo.length >= 3 && !item
      ? LISTA_LC116.filter((i) => semAcentoF(i.descricao).includes(termo) || i.codigo.includes(termo)).slice(0, 8) : [];
    buscaLc.innerHTML = resultados.map((i) => `<button type="button" data-cod="${i.codigo}"><b>${i.codigo}</b> ${escF(i.descricao)}</button>`).join("");
    buscaLc.querySelectorAll("[data-cod]").forEach((b) => b.addEventListener("click", () => {
      lc.value = b.dataset.cod;
      const nac = document.getElementById("fiscSrvTribNac");
      if (nac && !nac.value.trim()) nac.value = b.dataset.cod.replace(".", "") + "01";
      mostrarDescricao();
    }));
  };
  lc.addEventListener("input", mostrarDescricao);
  lc.addEventListener("change", () => { lc.value = normalizarCodigoLc116(lc.value) || lc.value; mostrarDescricao(); });
  lc._mostrarDescricao = mostrarDescricao;

  const extras = document.getElementById("listaCamposExtras").closest(".campo-largura-total");
  const bloco = document.createElement("div");
  bloco.className = "campo-largura-total bloco-fiscal";
  bloco.id = "blocoFiscalServico";
  bloco.innerHTML = `
    <div class="titulo-bloco-fiscal">🧾 Códigos para a NFS-e</div>
    <div class="grade-fiscal">
      <label>Código de tributação nacional
        <input type="text" id="fiscSrvTribNac" maxlength="6" inputmode="numeric" placeholder="6 dígitos, ex: 070501" />
        <small>Item + subitem da LC 116 + desdobro (ex.: 07.05 → 070501).</small>
      </label>
      <label>Código de tributação municipal
        <input type="text" id="fiscSrvTribMun" maxlength="20" placeholder="o código que Curitiba usa" />
        <small>Copie de uma NFS-e já emitida, se tiver dúvida.</small>
      </label>
      <label>Código NBS
        <div class="campo-com-busca">
          <input type="text" id="fiscSrvNbs" maxlength="12" placeholder="ex: 1.0102.11.00" />
          <a class="btn-busca-fiscal" href="${LINKS_FISCAIS.nbs}" target="_blank" rel="noopener" title="Pesquisar NBS">🔎 Buscar</a>
        </div>
        <small><a href="${LINKS_FISCAIS.nbsOficial}" target="_blank" rel="noopener">Tabela oficial (MDIC)</a></small>
      </label>
      <label>Grupo tributário
        <select id="fiscSrvGrupo" class="select-grupo-trib" data-tipo="servico"></select>
      </label>
    </div>`;
  extras.parentNode.insertBefore(bloco, extras);
  atualizarSelectsGrupoTributario();
}
function normalizarCodigoLc116(t) {
  const m = String(t || "").trim().match(/^(\d{1,2})[.,]?(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}.${m[2]}` : "";
}
function semAcentoF(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function lerFiscalServico() {
  const v = (id) => (document.getElementById(id)?.value || "").trim();
  return {
    codTribNacional: v("fiscSrvTribNac").replace(/\D/g, ""),
    codTribMunicipal: v("fiscSrvTribMun"),
    nbs: v("fiscSrvNbs"),
    grupoTributarioId: v("fiscSrvGrupo"),
  };
}
function preencherFiscalServico(f) {
  f = f || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("fiscSrvTribNac", f.codTribNacional);
  set("fiscSrvTribMun", f.codTribMunicipal);
  set("fiscSrvNbs", f.nbs);
  const sel = document.getElementById("fiscSrvGrupo");
  if (sel) { sel.dataset.valor = f.grupoTributarioId || ""; sel.value = f.grupoTributarioId || ""; }
  const lc = document.getElementById("campoCodigoLC116");
  if (lc && lc._mostrarDescricao) setTimeout(lc._mostrarDescricao, 0);
}

// ====================================================
// ABA "GRUPOS TRIBUTÁRIOS"
// ====================================================
function montarAbaGruposTributarios() {
  const abas = document.querySelector(".abas-nivel-superior");
  if (!abas || document.getElementById("btnAbaGruposTrib")) return;
  abas.insertAdjacentHTML("beforeend", `<button type="button" class="aba" id="btnAbaGruposTrib">🧾 Grupos tributários</button>`);
  const painelServicos = document.getElementById("painelServicos");
  painelServicos.insertAdjacentHTML("afterend", `
    <div id="painelGruposTrib" style="display:none;">
      <div class="barra-acoes">
        <p class="texto-ajuda-grupo">Um grupo reúne as regras de imposto que se repetem (CFOP, PIS, COFINS, ISS, IBS/CBS). Depois é só escolher o grupo no produto ou no serviço.</p>
        <div class="botoes-cadastro"><button type="button" class="btn-laranja" id="btnNovoGrupoTrib">+ Grupo tributário</button></div>
      </div>
      <div id="listaGruposTrib" class="lista-servicos"></div>
      <div class="sem-resultados" id="vazioGruposTrib" style="display:none;"><p>Nenhum grupo tributário cadastrado ainda.</p></div>
    </div>`);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-overlay" id="modalGrupoTrib">
      <div class="modal-caixa">
        <div class="modal-cabecalho">
          <h2 id="tituloModalGrupoTrib">Novo grupo tributário</h2>
          <button type="button" class="modal-fechar" id="fecharModalGrupoTrib">&times;</button>
        </div>
        <div class="form-modal-grid">
          <label>Código interno
            <input type="text" id="gtCodigo" maxlength="20" placeholder="ex: 001" />
          </label>
          <label>Vale para
            <select id="gtAplica">
              <option value="ambos">Produtos e serviços</option>
              <option value="material">Só produtos (NF-e)</option>
              <option value="servico">Só serviços (NFS-e)</option>
            </select>
          </label>
          <label class="campo-largura-total">Descrição
            <input type="text" id="gtDescricao" maxlength="120" placeholder="ex: Venda de produto — Simples Nacional" />
          </label>
          <label>CFOP de venda
            <input type="text" id="gtCfop" maxlength="4" inputmode="numeric" placeholder="ex: 5102" />
          </label>
          <label>Exigibilidade do ISS
            <select id="gtExigIss">${opcoesHtml(OPCOES_EXIGIBILIDADE_ISS, "1", "— Não se aplica —")}</select>
          </label>
          <label>Incentivo fiscal
            <select id="gtIncentivo"><option value="nao">Não</option><option value="sim">Sim</option></select>
          </label>
          <label>&nbsp;<span></span></label>
          <label>PIS — CST
            <select id="gtPisCst">${opcoesHtml(OPCOES_CST_PIS_COFINS, "", "— Selecione —")}</select>
          </label>
          <label>PIS — alíquota (%)
            <input type="text" inputmode="decimal" id="gtPisAliq" placeholder="ex: 0" />
          </label>
          <label>COFINS — CST
            <select id="gtCofinsCst">${opcoesHtml(OPCOES_CST_PIS_COFINS, "", "— Selecione —")}</select>
          </label>
          <label>COFINS — alíquota (%)
            <input type="text" inputmode="decimal" id="gtCofinsAliq" placeholder="ex: 0" />
          </label>
          <label>IBS/CBS — CST
            <input type="text" id="gtIbsCst" maxlength="3" inputmode="numeric" placeholder="3 dígitos, ex: 000" />
          </label>
          <label>IBS/CBS — classificação tributária (cClassTrib)
            <input type="text" id="gtIbsClasse" maxlength="6" inputmode="numeric" placeholder="6 dígitos, ex: 000001" />
          </label>
          <p class="campo-largura-total aviso-fiscal">Confira estes códigos com a contadora antes de emitir. Os de IBS/CBS são da Reforma Tributária (2026 em diante).</p>
          <button type="button" class="btn-laranja campo-largura-total" id="btnSalvarGrupoTrib">Salvar grupo</button>
        </div>
      </div>
    </div>`);

  // Troca de abas (as de Materiais/Serviços já existem na página)
  const painéis = { mat: document.getElementById("painelMateriais"), srv: document.getElementById("painelServicos"), gt: document.getElementById("painelGruposTrib") };
  const botoes = { mat: document.getElementById("btnAbaMateriais"), srv: document.getElementById("btnAbaServicos"), gt: document.getElementById("btnAbaGruposTrib") };
  const totalFixo = document.getElementById("totalFixoMateriais");
  botoes.gt.addEventListener("click", () => {
    Object.values(botoes).forEach((b) => b.classList.remove("active"));
    botoes.gt.classList.add("active");
    painéis.mat.style.display = "none"; painéis.srv.style.display = "none"; painéis.gt.style.display = "block";
    if (totalFixo) totalFixo.style.display = "none";
  });
  [botoes.mat, botoes.srv].forEach((b) => b.addEventListener("click", () => {
    botoes.gt.classList.remove("active");
    painéis.gt.style.display = "none";
  }));

  const modal = document.getElementById("modalGrupoTrib");
  const fechar = () => modal.classList.remove("active");
  document.getElementById("fecharModalGrupoTrib").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
  document.getElementById("btnNovoGrupoTrib").addEventListener("click", () => abrirModalGrupoTrib(null));
  document.getElementById("btnSalvarGrupoTrib").addEventListener("click", salvarGrupoTrib);
}

let grupoTribEditandoId = null;
function abrirModalGrupoTrib(g) {
  grupoTribEditandoId = g ? g.id : null;
  g = g || {};
  const set = (id, v) => { document.getElementById(id).value = v === undefined || v === null ? "" : v; };
  document.getElementById("tituloModalGrupoTrib").textContent = grupoTribEditandoId ? "Editar grupo tributário" : "Novo grupo tributário";
  set("gtCodigo", g.codigoInterno); set("gtAplica", g.aplicaEm || "ambos"); set("gtDescricao", g.descricao);
  set("gtCfop", g.cfopVenda); set("gtExigIss", g.exigibilidadeIss === undefined ? "1" : g.exigibilidadeIss);
  set("gtIncentivo", g.incentivoFiscal ? "sim" : "nao");
  set("gtPisCst", g.pisCst); set("gtPisAliq", g.pisAliquota); set("gtCofinsCst", g.cofinsCst); set("gtCofinsAliq", g.cofinsAliquota);
  set("gtIbsCst", g.ibsCbsCst); set("gtIbsClasse", g.ibsCbsClassTrib);
  document.getElementById("modalGrupoTrib").classList.add("active");
}
async function salvarGrupoTrib() {
  const v = (id) => document.getElementById(id).value.trim();
  if (!v("gtDescricao")) { mostrarToast("Escreva a descrição do grupo.", "erro"); return; }
  if (v("gtCfop") && !/^\d{4}$/.test(v("gtCfop"))) { mostrarToast("CFOP tem 4 números (ex.: 5102).", "erro"); return; }
  if (v("gtIbsCst") && !/^\d{3}$/.test(v("gtIbsCst"))) { mostrarToast("CST do IBS/CBS tem 3 números.", "erro"); return; }
  if (v("gtIbsClasse") && !/^\d{6}$/.test(v("gtIbsClasse"))) { mostrarToast("cClassTrib tem 6 números.", "erro"); return; }
  const grupo = {
    id: grupoTribEditandoId,
    codigoInterno: v("gtCodigo"), aplicaEm: v("gtAplica"), descricao: v("gtDescricao"),
    cfopVenda: v("gtCfop"), exigibilidadeIss: v("gtExigIss"), incentivoFiscal: v("gtIncentivo") === "sim",
    pisCst: v("gtPisCst"), pisAliquota: v("gtPisAliq"), cofinsCst: v("gtCofinsCst"), cofinsAliquota: v("gtCofinsAliq"),
    ibsCbsCst: v("gtIbsCst"), ibsCbsClassTrib: v("gtIbsClasse"),
  };
  const botao = document.getElementById("btnSalvarGrupoTrib");
  botao.disabled = true;
  const r = await chamarWorker("grupos-trib-salvar", { method: "POST", body: grupo });
  botao.disabled = false;
  if (!r.ok) { mostrarToast(r.erro || "Não foi possível salvar.", "erro"); return; }
  mostrarToast("Grupo tributário salvo.");
  document.getElementById("modalGrupoTrib").classList.remove("active");
  carregarGruposTributarios();
}
function renderListaGruposTributarios() {
  const lista = document.getElementById("listaGruposTrib");
  if (!lista) return;
  const vazio = document.getElementById("vazioGruposTrib");
  vazio.style.display = gruposTributariosCache.length ? "none" : "block";
  const nomeAplica = { ambos: "Produtos e serviços", material: "Produtos", servico: "Serviços" };
  lista.innerHTML = gruposTributariosCache.map((g) => `
    <div class="item-servico item-grupo-trib">
      <div>
        <div class="nome">${escF(rotuloGrupoTributario(g))}</div>
        <div class="meta">${escF([nomeAplica[g.aplicaEm] || "Produtos e serviços", g.cfopVenda ? "CFOP " + g.cfopVenda : "",
          g.pisCst ? "PIS " + g.pisCst : "", g.cofinsCst ? "COFINS " + g.cofinsCst : "", g.ibsCbsCst ? "IBS/CBS " + g.ibsCbsCst + (g.ibsCbsClassTrib ? "/" + g.ibsCbsClassTrib : "") : ""].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="acoes">
        <button type="button" class="btn-editar" data-editar-gt="${escF(g.id)}">Editar</button>
        <button type="button" class="btn-excluir-item" data-excluir-gt="${escF(g.id)}">Excluir</button>
      </div>
    </div>`).join("");
  lista.querySelectorAll("[data-editar-gt]").forEach((b) => b.addEventListener("click", () =>
    abrirModalGrupoTrib(gruposTributariosCache.find((g) => g.id === b.dataset.editarGt))));
  lista.querySelectorAll("[data-excluir-gt]").forEach((b) => b.addEventListener("click", async () => {
    const ok = await confirmarAcao("Excluir este grupo tributário?", "Produtos e serviços ligados a ele ficam sem grupo.");
    if (!ok) return;
    const r = await chamarWorker("grupos-trib-excluir", { method: "POST", body: { id: b.dataset.excluirGt } });
    if (!r.ok) { mostrarToast(r.erro || "Não foi possível excluir.", "erro"); return; }
    carregarGruposTributarios();
  }));
}

// ---- estilos ----
(function () {
  const estilo = document.createElement("style");
  estilo.textContent = `
    .bloco-fiscal { grid-column: 1 / -1 !important; min-width: 0; border: 1px solid #f0e2c0; background: #fffbf2; border-radius: 10px; padding: 12px; }
    .titulo-bloco-fiscal { font-weight: 700; font-size: 13.5px; color: #7a5a20; margin-bottom: 10px; }
    .grade-fiscal { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grade-fiscal > * { min-width: 0; }
    .grade-fiscal label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: #333; }
    .grade-fiscal input, .grade-fiscal select, .grade-fiscal textarea { padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-family: inherit; font-size: 14px; font-weight: normal; }
    .grade-fiscal small { font-weight: normal; color: #888; font-size: 11.5px; }
    .grade-fiscal .campo-largura-total { grid-column: 1 / -1; }
    .campo-com-busca { display: flex; gap: 6px; align-items: stretch; }
    .campo-com-busca input { flex: 1; min-width: 0; }
    .btn-busca-fiscal { display: inline-flex; align-items: center; white-space: nowrap; padding: 0 10px; border: 1px solid #b9cfe6; border-radius: 6px;
      background: #eef5fc; color: #1D5FB4; font-size: 12.5px; font-weight: 700; text-decoration: none; }
    .btn-busca-fiscal:hover { background: #e0ecf9; }
    .linha-chave { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #333; }
    .chave { position: relative; width: 42px; height: 24px; flex: 0 0 auto; }
    .chave input { opacity: 0; width: 0; height: 0; }
    .chave .trilho { position: absolute; inset: 0; background: #ccc; border-radius: 24px; cursor: pointer; transition: .2s; }
    .chave .trilho::before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
    .chave input:checked + .trilho { background: #FF6A00; }
    .chave input:checked + .trilho::before { transform: translateX(18px); }
    .ajuda-lc116 { font-size: 12px; font-weight: normal; color: #1c7a43; }
    .ajuda-lc116 a { color: #1D5FB4; }
    .resultados-lc116 { display: flex; flex-direction: column; gap: 4px; }
    .resultados-lc116 button { text-align: left; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 6px 8px; font-size: 12.5px;
      font-family: inherit; font-weight: normal; cursor: pointer; color: #333; }
    .resultados-lc116 button:hover { border-color: #FF6A00; background: #FFF6EF; }
    .texto-ajuda-grupo { font-size: 13px; color: #666; margin: 0; max-width: 640px; }
    .aviso-fiscal { font-size: 12px; color: #8a6d1f; background: #fff7e0; border-radius: 6px; padding: 8px 10px; margin: 0; }
    .item-grupo-trib { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; background: #fff;
      border: 1px solid #eee; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }
    .item-grupo-trib .nome { font-weight: 700; }
    .item-grupo-trib .meta { font-size: 12px; color: #888; margin-top: 2px; }
    .item-grupo-trib .acoes { display: flex; gap: 8px; }
    @media (max-width: 700px) { .grade-fiscal { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(estilo);
})();

montarCamposFiscaisMaterial();
montarCamposFiscaisServico();
montarAbaGruposTributarios();
carregarGruposTributarios();
