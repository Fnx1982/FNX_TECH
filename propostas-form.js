// ============================================================
// propostas-form.js
// Modal de criar/editar proposta — compartilhado entre
// orcamento.html, propostas.html e andamento.html.
// ============================================================

let propostaEmEdicao = null;
let onSalvarPropostaCallback = null;

// ── Rascunho automático (auto-save) ───────────────────────────
// id do rascunho salvo no servidor pra esta proposta em edição.
// null enquanto o formulário estiver totalmente vazio (não cria
// rascunho de um formulário em branco); ganha um valor assim que o
// primeiro campo com conteúdo perde o foco.
let rascunhoAtualId = null;
// Trava simples: enquanto o "Salvar Orçamento" de verdade estiver
// rodando, o rascunho automático não pode disparar em paralelo —
// clicar em Salvar tira o foco do último campo editado, o que
// dispara o rascunho ao mesmo tempo que o salvamento de verdade
// (uma corrida de eventos real, não hipotética).
let salvandoPropostaDeVerdade = false;
let onListaPendentesAtualizarCallback = null;

// ── Autocomplete de cliente (Contatos) ────────────────────────────
let contatosCacheOrcamento = [];

async function carregarAutocompleteContatosOrcamento() {
  try {
    const resposta = await apiListarContatos();
    if (!resposta.ok) return;
    contatosCacheOrcamento = resposta.contatos;
    const datalist = document.getElementById("listaClientesOrcamentoDatalist");
    if (datalist) datalist.innerHTML = contatosCacheOrcamento.map((c) => `<option value="${escaparHtml(c.nome)}"></option>`).join("");
  } catch (e) { /* autocomplete é um extra — se falhar, o formulário continua funcionando normalmente */ }
}

// Se o nome digitado bate com um contato já cadastrado, preenche
// telefone e endereço automaticamente (não sobrescreve se a pessoa
// já tiver digitado algo diferente nesses campos).
function tentarAutopreencherClienteOrcamento() {
  const nomeDigitado = document.getElementById("campoCliente").value.trim();
  const contato = contatosCacheOrcamento.find((c) => c.nome === nomeDigitado);
  if (!contato) return;
  // Escolheu um contato cadastrado: puxa sempre o endereço, o telefone
  // e o CPF/CNPJ dele (dá pra editar depois, se precisar)
  const campoTel = document.getElementById("campoTelefone");
  const campoLoc = document.getElementById("campoLocal");
  const campoDoc = document.getElementById("campoDocumentoCliente");
  if (contato.telefone) campoTel.value = contato.telefone;
  if (contato.documento && campoDoc) campoDoc.value = contato.documento;
  const enderecoPartes = [[contato.logradouro, contato.numero].filter(Boolean).join(", "), contato.bairro, [contato.cidade, contato.uf].filter(Boolean).join("/")].filter(Boolean);
  if (enderecoPartes.length) campoLoc.value = enderecoPartes.join(" - ");
}

// Se o cliente que acabou de ser salvo na proposta ainda não existe
// em Contatos, cria um registro básico lá (nome, telefone e o
// documento, se a pessoa preencheu — não é obrigatório no
// Orçamento, então pode vir vazio e ser completado depois, na tela
// de Contatos, quando/se precisar emitir nota fiscal pra ele).
async function garantirClienteEmContatos(nome, telefone, documento) {
  if (!nome) return;
  const jaExiste = contatosCacheOrcamento.some((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) return;
  const documentoLimpo = (documento || "").replace(/\D/g, "");
  const tipoPessoa = documentoLimpo.length === 14 ? "PJ" : "PF";
  const resposta = await apiSalvarContato({ nome, telefone: telefone || "", tipoPessoa, documento: documento || "" });
  if (resposta.ok) contatosCacheOrcamento.push({ id: resposta.id, nome, telefone: telefone || "", documento: documento || "" });
}

const UNIDADES_PADRAO = ["UND", "CM", "CM²", "M", "M²", "ML"];

// Gera as <option> do select de unidade, com o valor atual já
// selecionado — inclusive se for um valor antigo que não está na
// lista padrão (nesse caso, adiciona ele como opção extra, pra não
// perder o dado de itens já cadastrados antes dessa lista existir).
function opcoesUnidadeHtml(valorAtual) {
  const valor = (valorAtual || "UND").toUpperCase();
  let opcoes = UNIDADES_PADRAO.map((u) => `<option value="${u}"${u === valor ? " selected" : ""}>${u}</option>`).join("");
  if (!UNIDADES_PADRAO.includes(valor)) {
    opcoes += `<option value="${escaparHtml(valor)}" selected>${escaparHtml(valor)} (valor antigo)</option>`;
  }
  return opcoes;
}

function montarModalFormularioProposta() {
  if (document.getElementById("modalProposta")) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modalProposta";
  overlay.innerHTML = `
    <div class="modal-caixa-grande caixa-orcamento">
      <div class="modal-cabecalho">
        <h2 id="tituloModalProposta">Novo Orçamento</h2>
        <button type="button" class="modal-fechar" id="fecharModalProposta">&times;</button>
      </div>
      <p id="statusRascunhoProposta" style="font-size:12px; color:#888; margin:-6px 0 10px;"></p>

      <div class="form-secao secao-cliente">
        <h3>Dados do Cliente / Obra</h3>
        <div class="form-grid">
          <label>Número do Orçamento
            <div style="display:flex; gap:6px;">
              <input type="text" id="campoNumeroOrcamento" placeholder="Ex: 2026-001" style="flex:1;" />
              <button type="button" id="btnConfigNumeracaoOrcamento" title="Configurar numeração automática" style="flex:0 0 auto; border:1px solid #ccc; border-radius:6px; background:#fff; cursor:pointer; padding:0 10px;">⚙</button>
            </div>
          </label>
          <label>Cliente
            <input type="text" id="campoCliente" placeholder="Nome do cliente" list="listaClientesOrcamentoDatalist" />
            <datalist id="listaClientesOrcamentoDatalist"></datalist>
          </label>
          <label><span class="rotulo-com-opcional">CPF / CNPJ <span class="texto-opcional-inline">opcional</span></span>
            <input type="text" id="campoDocumentoCliente" placeholder="000.000.000-00" />
          </label>
          <label>Telefone
            <input type="text" id="campoTelefone" placeholder="(99) 9 9999-9999" maxlength="17" />
          </label>
          <label>Responsável pela proposta
            <input type="text" id="campoResponsavel" placeholder="Quem está fazendo o orçamento" list="listaResponsaveisDatalist" autocomplete="off" />
            <datalist id="listaResponsaveisDatalist"></datalist>
          </label>
          <label>Nome do local
            <input type="text" id="campoLocalDescricao" placeholder="Ex.: Ed. L'Espace Alameda, Condomínio Sol" />
          </label>
          <label class="campo-largura-total">Endereço
            <input type="text" id="campoLocal" placeholder="Rua, número, bairro, cidade" />
          </label>
          <label class="campo-largura-total">Serviço
            <textarea id="campoServico" rows="3" placeholder="Descrição do serviço (vem do descritivo da visita)"></textarea>
          </label>
          <label class="campo-largura-total"><span class="rotulo-com-opcional">Observação para o cliente <span class="texto-opcional-inline">opcional — sai no PDF do cliente</span></span>
            <textarea id="campoObservacao" rows="2" placeholder="Só o que o cliente deve ler..."></textarea>
          </label>
          <label class="campo-largura-total campo-interno-visita"><span class="rotulo-com-opcional">Dados da visita <span class="tag-interno">só empresa</span> <span class="texto-opcional-inline">medidas tiradas no local — só no PDF interno</span></span>
            <textarea id="campoDadosVisitaInterno" rows="4" placeholder="Medidas tiradas no local..."></textarea>
          </label>
        </div>
      </div>

      <div class="form-secao secao-mao-obra">
        <h3>Mão de Obra</h3>
        <p class="texto-ajuda" style="margin-bottom:8px;">
          Digitar uma descrição que já existe no catálogo de Serviços preenche o valor sozinho.
          Descrições novas são salvas no catálogo automaticamente, pra aparecer aqui e na NFS-e depois.
        </p>
        <table class="itens-tabela" id="tabelaMaoDeObra">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Qtd</th>
              <th>Unid</th>
              <th>Valor Unit. <span style="font-weight:normal;font-size:10px;">(opcional)</span></th>
              <th>Valor Final</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <datalist id="listaServicosPropostaDatalist"></datalist>
        <button type="button" class="btn-add-item" id="btnAddMaoDeObra">+ Adicionar item de mão de obra</button>
        <div class="linha-total-secao" style="flex-direction:column;align-items:flex-end;gap:6px;">
          <div>Subtotal M.O.: <span id="subtotalMaoDeObraTexto">R$ 0,00</span></div>
          <div class="linha-desconto">
            <label for="descontoMaoDeObra">Desconto M.O. <span class="valor-desconto" id="descontoTextoMaoDeObra"></span></label>
            <input type="text" inputmode="decimal" id="descontoMaoDeObra" placeholder="0" />
            <select id="descontoTipoMaoDeObra" title="Desconto em reais ou em porcentagem">
              <option value="rs">R$</option>
              <option value="pct">%</option>
            </select>
          </div>
          <input type="hidden" id="ajusteMaoDeObra" />
          <div class="aviso-acrescimo-antigo" id="avisoAjusteMaoDeObra" style="display:none;"></div>
          <div style="font-size:16px;font-weight:700;">Total M.O.: <span id="totalMaoDeObraTexto">R$ 0,00</span></div>
        </div>
      </div>

      <div class="form-secao secao-materiais">
        <h3>Materiais</h3>
        <p class="texto-ajuda" style="margin-bottom:8px;">
          Clique no campo <strong>Material</strong> para ver a lista, ou digite para pesquisar — o valor
          já vem preenchido. Material novo é só digitar o nome: ele é salvo no catálogo ao salvar o orçamento.
          Preencha <strong>Qtd × Valor Unit.</strong> ou direto o <strong>Valor Final</strong>.
        </p>
        <table class="itens-tabela" id="tabelaMateriais">
          <thead>
            <tr>
              <th>Material</th>
              <th>Qtd</th>
              <th>Unid</th>
              <th>Valor Unit. <span style="font-weight:normal;font-size:10px;">(opcional)</span></th>
              <th>Valor Final</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <button type="button" class="btn-add-item" id="btnAddMaterial">+ Adicionar material</button>
        <div class="linha-total-secao" style="flex-direction:column;align-items:flex-end;gap:6px;">
          <div>Subtotal Materiais: <span id="subtotalMateriaisTexto">R$ 0,00</span></div>
          <div class="linha-desconto">
            <label for="descontoMateriais">Desconto Materiais <span class="valor-desconto" id="descontoTextoMateriais"></span></label>
            <input type="text" inputmode="decimal" id="descontoMateriais" placeholder="0" />
            <select id="descontoTipoMateriais" title="Desconto em reais ou em porcentagem">
              <option value="rs">R$</option>
              <option value="pct">%</option>
            </select>
          </div>
          <input type="hidden" id="ajusteMateriais" />
          <div class="aviso-acrescimo-antigo" id="avisoAjusteMateriais" style="display:none;"></div>
          <div style="font-size:16px;font-weight:700;">Total Materiais: <span id="totalMateriaisTexto">R$ 0,00</span></div>
        </div>
      </div>

      <div class="form-secao secao-links-materiais">
        <h3>Links dos materiais <span class="tag-interno">só empresa</span></h3>
        <p class="texto-ajuda">
          Onde comprar cada material (loja, site, fornecedor). <strong>Não aparece no PDF do cliente</strong> —
          só na tela e no PDF Interno, com o link clicável.
        </p>
        <div id="listaLinksMateriais"></div>
        <div class="botoes-links-materiais">
          <button type="button" class="btn-add-item" id="btnAddLinkMaterial">+ Adicionar link</button>
          <button type="button" class="btn-link-impostos" id="btnPuxarMateriaisLinks">Puxar os materiais desta proposta</button>
        </div>
      </div>

      <div class="form-secao secao-impostos">
        <h3>Impostos <span class="tag-interno">só empresa</span></h3>
        <p class="texto-ajuda">
          Não aparece no PDF do cliente. INSS e ISS são calculados só sobre a <strong>Mão de Obra</strong>;
          o imposto de material, só sobre os <strong>Materiais</strong>. Em Curitiba o ISS não entra.
        </p>
        <div class="form-grid">
          <label>Local da obra
            <select id="campoLocalObra">
              <option value="curitiba">Curitiba</option>
              <option value="fora">Fora de Curitiba</option>
            </select>
          </label>
          <label>Mês de referência
            <select id="campoMesImpostosOrc"></select>
          </label>
        </div>
        <div class="grid-impostos">
          <label>INSS %
            <input type="number" id="campoInssOrc" min="0" max="100" step="0.01" placeholder="0" />
          </label>
          <label id="rotuloIssOrc">ISS %
            <input type="number" id="campoIssOrc" min="0" max="100" step="0.01" placeholder="0" />
            <small class="aviso-iss-curitiba" id="avisoIssCuritiba">Não entra em Curitiba</small>
          </label>
          <label>Material %
            <input type="number" id="campoMatOrc" min="0" max="100" step="0.01" placeholder="0" />
          </label>
        </div>
        <table class="tabela-resumo-impostos">
          <tbody id="resumoImpostosOrc"></tbody>
        </table>
        <button type="button" class="btn-link-impostos" id="btnEditarImpostosMesForm">Editar % padrão de cada mês</button>
      </div>

      <div class="form-secao secao-condicoes">
        <h3>Condições</h3>
        <div class="grupo-condicao">
          <div class="titulo-condicao">💳 Forma de pagamento</div>
          <div class="form-grid grid-pagamento">
            <label class="campo-largura-total">Como vai ser pago
              <input type="text" id="campoFormaPagamento" placeholder="Ex.: boletos bancários para CNPJ, PIX, cartão" />
            </label>
            <label>Entrada (%)
              <input type="text" inputmode="decimal" id="campoEntradaPerc" placeholder="Ex.: 50 (vazio = sem entrada)" />
            </label>
            <label>Parcelas do saldo
              <input type="number" id="campoParcelas" min="0" max="60" placeholder="Ex.: 1 (vazio = à vista)" />
            </label>
            <label class="campo-largura-total">Vencimento das parcelas
              <input type="text" id="campoPrazosParcelas" placeholder="Ex.: 30 dias — ou 30/60/90/120 dias" />
            </label>
          </div>
          <div class="previa-pagamento" id="previaPagamento"></div>
        </div>
        <div class="form-grid grid-condicoes-prazos">
          <label>Validade (dias corridos)
            <input type="number" id="campoValidade" min="0" placeholder="Ex.: 20" />
          </label>
          <label>Programação (dias úteis)
            <input type="number" id="campoPlanejamento" min="0" placeholder="Ex.: 7" />
          </label>
          <label>Garantia dos serviços
            <input type="text" id="campoGarantia" placeholder="Ex.: 3 meses" />
          </label>
        </div>
      </div>

      <div class="linha-total-secao" style="font-size:16px;">TOTAL GERAL: <span id="totalGeralTexto">R$ 0,00</span></div>

      <div class="modal-rodape">
        <button type="button" class="btn-secundario" id="btnCancelarProposta">Cancelar</button>
        <button type="button" class="btn-laranja" id="btnSalvarProposta">Salvar Orçamento</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("fecharModalProposta").addEventListener("click", fecharFormularioProposta);
  document.getElementById("btnCancelarProposta").addEventListener("click", fecharFormularioProposta);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) fecharFormularioProposta();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) fecharFormularioProposta();
  });

  document.getElementById("btnAddMaoDeObra").addEventListener("click", adicionarLinhaMaoDeObra);
  document.getElementById("btnAddMaterial").addEventListener("click", adicionarLinhaMaterial);
  document.getElementById("btnAddLinkMaterial").addEventListener("click", () => adicionarLinkMaterial("", ""));
  document.getElementById("btnPuxarMateriaisLinks").addEventListener("click", puxarMateriaisParaLinks);
  document.getElementById("btnSalvarProposta").addEventListener("click", salvarFormularioProposta);
  document.getElementById("btnConfigNumeracaoOrcamento").addEventListener("click", () => {
    abrirModalConfigNumeracao("orcamento", "Orçamento");
  });
  document.getElementById("campoTelefone").addEventListener("input", aplicarMascaraTelefoneProposta);
  document.getElementById("campoDocumentoCliente").addEventListener("blur", formatarDocumentoClienteOrcamento);
  ["descontoMaoDeObra", "descontoTipoMaoDeObra", "descontoMateriais", "descontoTipoMateriais",
   "campoEntradaPerc", "campoParcelas", "campoPrazosParcelas"].forEach((idCampo) => {
    const el = document.getElementById(idCampo);
    el.addEventListener("input", atualizarTotaisFormulario);
    el.addEventListener("change", atualizarTotaisFormulario);
  });
  document.getElementById("campoCliente").addEventListener("change", tentarAutopreencherClienteOrcamento);
  limparErroAoEditar(document.getElementById("campoCliente"));

  // Impostos: trocar o mês puxa as % padrão daquele mês; as % podem ser
  // ajustadas na mão só para este orçamento.
  document.getElementById("campoLocalObra").addEventListener("change", () => {
    coletarImpostosDoFormulario();
    atualizarResumoImpostos();
  });
  document.getElementById("campoMesImpostosOrc").addEventListener("change", (e) => {
    propostaEmEdicao.impostos = impostosPadraoParaProposta(e.target.value);
    preencherCamposImpostos();
    atualizarResumoImpostos();
  });
  ["campoInssOrc", "campoIssOrc", "campoMatOrc"].forEach((idCampo) => {
    document.getElementById(idCampo).addEventListener("input", () => {
      coletarImpostosDoFormulario();
      atualizarResumoImpostos();
    });
  });
  document.getElementById("btnEditarImpostosMesForm").addEventListener("click", () => {
    abrirModalImpostosMes(propostaEmEdicao && propostaEmEdicao.impostos ? propostaEmEdicao.impostos.mesRef : null);
  });

  // Auto-save: qualquer um destes campos, ao perder o foco, salva o
  // formulário inteiro como rascunho no servidor — sem precisar clicar
  // em nada. Itens de mão de obra/materiais já disparam o próprio save
  // no "blur" deles (ver renderTabelaMaoDeObra/renderTabelaMateriais).
  const camposComAutoSave = [
    "campoNumeroOrcamento", "campoCliente", "campoResponsavel", "campoTelefone", "campoLocal",
    "campoServico", "campoObservacao", "campoFormaPagamento", "campoPlanejamento", "campoValidade",
    "campoLocalDescricao", "campoDadosVisitaInterno", "campoEntradaPerc", "campoParcelas", "campoPrazosParcelas", "campoGarantia",
    "descontoMaoDeObra", "descontoMateriais",
    "campoLocalObra", "campoMesImpostosOrc", "campoInssOrc", "campoIssOrc", "campoMatOrc",
  ];
  camposComAutoSave.forEach((idCampo) => {
    const el = document.getElementById(idCampo);
    if (el) el.addEventListener("blur", () => salvarRascunhoAtual());
  });

  // Itens de mão de obra e materiais: "focusout" borbulha (diferente de
  // "blur"), então um único listener na tabela cobre qualquer input
  // dentro dela, mesmo linhas adicionadas depois desse momento.
  const tabelaMO = document.getElementById("tabelaMaoDeObra");
  const tabelaMat = document.getElementById("tabelaMateriais");
  if (tabelaMO) tabelaMO.addEventListener("focusout", () => salvarRascunhoAtual());
  if (tabelaMat) tabelaMat.addEventListener("focusout", () => salvarRascunhoAtual());
}

// ── Autocomplete customizado (substitui <datalist> nativo — o
// navegador não deixa estilizar aquela caixa preta que o datalist
// mostra). "obterOpcoes" é uma função (não uma lista pronta), porque
// o catálogo pode mudar entre um render e outro. "aoSelecionar" roda
// depois que a pessoa escolhe uma sugestão, pra ligar o item ao
// catálogo (mesma lógica que já existia pro datalist nativo).
// "obterDetalhe" (opcional) devolve um texto curto mostrado à direita
// de cada sugestão — usado pra mostrar o preço do catálogo.
function normalizarBusca(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function criarAutocompleteCustomizado(inputEl, obterOpcoes, aoSelecionar, obterDetalhe) {
  const wrapper = document.createElement("div");
  wrapper.className = "autocomplete-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  const lista = document.createElement("div");
  lista.className = "autocomplete-lista";
  wrapper.appendChild(lista);

  let opcoesAtuais = [];
  let indiceAtivo = -1;

  function fecharLista() {
    lista.style.display = "none";
    indiceAtivo = -1;
  }

  function escolher(nome) {
    inputEl.value = nome;
    fecharLista();
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    if (aoSelecionar) aoSelecionar(nome);
  }

  function renderSugestoes() {
    // Campo vazio: mostra a lista inteira (em ordem alfabética) pra
    // escolher clicando. Digitando: filtra, sem ligar pra acento.
    const termo = normalizarBusca(inputEl.value.trim());
    const todas = obterOpcoes().slice().sort((a, b) => a.localeCompare(b, "pt-BR"));
    opcoesAtuais = termo ? todas.filter((nome) => normalizarBusca(nome).includes(termo)) : todas;
    opcoesAtuais = opcoesAtuais.slice(0, 50);
    if (opcoesAtuais.length === 0) { fecharLista(); return; }

    lista.innerHTML = opcoesAtuais.map((nome) => {
      const detalhe = obterDetalhe ? obterDetalhe(nome) : "";
      return `<div class="autocomplete-item"><span>${escaparHtml(nome)}</span>${detalhe ? `<span class="autocomplete-detalhe">${escaparHtml(detalhe)}</span>` : ""}</div>`;
    }).join("");
    lista.style.display = "block";
    indiceAtivo = -1;

    lista.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      // mousedown (não click) evita que o blur do input feche a
      // lista ANTES do clique registrar.
      el.addEventListener("mousedown", (e) => { e.preventDefault(); escolher(opcoesAtuais[i]); });
    });
  }

  function marcarAtivo() {
    lista.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      el.classList.toggle("ativo", i === indiceAtivo);
      if (i === indiceAtivo) el.scrollIntoView({ block: "nearest" });
    });
  }

  inputEl.addEventListener("input", renderSugestoes);
  inputEl.addEventListener("focus", renderSugestoes);
  inputEl.addEventListener("blur", () => setTimeout(fecharLista, 150));
  inputEl.addEventListener("keydown", (e) => {
    if (lista.style.display !== "block") return;
    if (e.key === "ArrowDown") { e.preventDefault(); indiceAtivo = Math.min(indiceAtivo + 1, opcoesAtuais.length - 1); marcarAtivo(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); indiceAtivo = Math.max(indiceAtivo - 1, 0); marcarAtivo(); }
    else if (e.key === "Enter" && indiceAtivo >= 0) { e.preventDefault(); escolher(opcoesAtuais[indiceAtivo]); }
    else if (e.key === "Escape") { fecharLista(); }
  });
}

function aplicarMascaraTelefoneProposta(event) {
  let input = event.target;
  let valor = input.value.replace(/\D/g, "");
  if (valor.length > 11) valor = valor.slice(0, 11);
  if (valor.length > 7) valor = valor.replace(/^(\d{2})(\d{1})(\d{4})(\d{0,4}).*/, "($1) $2 $3-$4");
  else if (valor.length > 3) valor = valor.replace(/^(\d{2})(\d{1})(\d{0,4})/, "($1) $2 $3");
  else if (valor.length > 2) valor = valor.replace(/^(\d{2})(\d{0,1})/, "($1) $2");
  else if (valor.length > 0) valor = valor.replace(/^(\d{0,2})/, "($1");
  input.value = valor.trim();
}

// Formata CPF/CNPJ ao sair do campo — não bloqueia nada (o campo é
// opcional no Orçamento), só arruma a aparência quando dá pra
// reconhecer o padrão certo (11 ou 14 dígitos).
function formatarDocumentoClienteOrcamento() {
  const campo = document.getElementById("campoDocumentoCliente");
  const digitos = campo.value.replace(/\D/g, "");
  if (digitos.length === 11) campo.value = formatarCPF(digitos);
  else if (digitos.length === 14) campo.value = formatarCNPJ(digitos);
}

// "rascunhoId" só é passado quando o formulário está sendo reaberto a
// partir da lista de "Pendentes" — nesse caso o auto-save continua
// atualizando o MESMO rascunho (em vez de criar um novo), e "dadosPreenchidos"
// carrega o conteúdo salvo do rascunho.
async function abrirFormularioProposta(id, onSalvar, dadosPreenchidos, rascunhoId) {
  montarModalFormularioProposta();
  onSalvarPropostaCallback = onSalvar || null;
  rascunhoAtualId = rascunhoId || null;
  propostaEmEdicao = id ? JSON.parse(JSON.stringify(buscarProposta(id))) : criarPropostaVazia();
  if (!id && dadosPreenchidos) Object.assign(propostaEmEdicao, dadosPreenchidos);

  // Orçamento novo, sem número ainda — pega o próximo da numeração
  // automática (se estiver configurada; senão fica em branco e a
  // pessoa preenche na mão, como sempre foi).
  if (!id && !propostaEmEdicao.numeroOrcamento) {
    try {
      propostaEmEdicao.numeroOrcamento = String(await proximoNumeroSequencial("orcamento"));
    } catch (e) { /* sem numeração configurada — segue sem número */ }
  }

  carregarAutocompleteContatosOrcamento();

  const statusEl = document.getElementById("statusRascunhoProposta");
  if (statusEl) statusEl.textContent = rascunhoAtualId ? "Continuando um rascunho pendente." : "";

  document.getElementById("tituloModalProposta").textContent = id ? "Editar Orçamento" : "Novo Orçamento";
  document.getElementById("campoNumeroOrcamento").value = propostaEmEdicao.numeroOrcamento || "";
  document.getElementById("campoCliente").value = propostaEmEdicao.cliente;
  // Responsável: orçamento novo já vem com quem está logado (dá pra trocar)
  if (!id && !propostaEmEdicao.responsavelNome) {
    propostaEmEdicao.responsavelNome = localStorage.getItem("userNome") || "";
    propostaEmEdicao.responsavelRegistro = localStorage.getItem("userId") || null;
  }
  document.getElementById("campoResponsavel").value = propostaEmEdicao.responsavelNome || propostaEmEdicao.criadoPorNome || "";
  carregarListaResponsaveis();
  document.getElementById("campoDocumentoCliente").value = propostaEmEdicao.documentoCliente || "";
  document.getElementById("campoTelefone").value = propostaEmEdicao.telefone;
  document.getElementById("campoLocal").value = propostaEmEdicao.local;
  document.getElementById("campoServico").value = propostaEmEdicao.servico;
  document.getElementById("campoObservacao").value = propostaEmEdicao.observacao || "";
  document.getElementById("campoFormaPagamento").value = propostaEmEdicao.formaPagamento;
  document.getElementById("campoPlanejamento").value = propostaEmEdicao.planejamentoDias;
  document.getElementById("campoValidade").value = propostaEmEdicao.validadeDias;
  preencherCamposExtrasOrcamento();

  document.getElementById("modalProposta").classList.add("active");

  // Carrega os catálogos de material/serviço da nuvem antes de montar
  // os checklists e o autocomplete — abre o modal já, e preenche essa
  // parte assim que a resposta chegar (evita travar a tela esperando).
  await Promise.all([carregarCatalogosDeItens(), carregarTabelaImpostosMes()]);

  // Orçamento novo (ou antigo, de antes dos impostos existirem): pega
  // as % padrão do mês em que foi criado.
  if (!propostaEmEdicao.localObra) propostaEmEdicao.localObra = "curitiba";
  if (!propostaEmEdicao.impostos) {
    propostaEmEdicao.impostos = impostosPadraoParaProposta(chaveMesImpostosOrc(propostaEmEdicao.criadoEm));
  }
  preencherCamposImpostos();
  // Veio de uma visita técnica: mostra as fotos dela num quadro no canto
  if (propostaEmEdicao.visitaId) mostrarPainelFotosVisita(propostaEmEdicao.visitaId);
  else esconderPainelFotosVisita();
  if (!Array.isArray(propostaEmEdicao.linksMateriais)) propostaEmEdicao.linksMateriais = [];
  renderLinksMateriais();

  renderChecklistMateriaisEstoque();
  atualizarDatalistServicos();
  renderTabelaMaoDeObra();
  renderTabelaMateriais();

  // Preenche ajustes salvos (ou zera se for nova proposta)
  const ajusteMOEl = document.getElementById("ajusteMaoDeObra");
  const ajusteMatEl = document.getElementById("ajusteMateriais");
  // O "Ajuste" saiu da tela (agora é só Desconto). Orçamento antigo com
  // ajuste negativo vira desconto em R$; ajuste positivo (acréscimo)
  // continua valendo e aparece só como aviso, pra não mudar o total.
  [["MaoDeObra", ajusteMOEl], ["Materiais", ajusteMatEl]].forEach(([suf, el]) => {
    let aj = parseFloat(propostaEmEdicao["ajuste" + suf]) || 0;
    if (aj < 0 && !(Number(propostaEmEdicao["desconto" + suf]) > 0)) {
      propostaEmEdicao["desconto" + suf] = Math.abs(aj);
      propostaEmEdicao["descontoTipo" + suf] = "rs";
      document.getElementById("desconto" + suf).value = String(Math.abs(aj)).replace(".", ",");
      document.getElementById("descontoTipo" + suf).value = "rs";
      aj = 0;
    }
    if (el) el.value = aj || "";
    const aviso = document.getElementById("avisoAjuste" + suf);
    if (aviso) {
      aviso.style.display = aj ? "" : "none";
      aviso.textContent = aj ? `Acréscimo de orçamento antigo: ${aj > 0 ? "+" : "-"} R$ ${formatarMoeda(Math.abs(aj))}` : "";
    }
  });

  atualizarTotaisFormulario();
}

// ====================================================
// RESPONSÁVEL PELA PROPOSTA — lista de pessoas cadastradas. Quem é
// escolhido aqui também passa a ver o orçamento (além de quem criou).
// ====================================================
let usuariosResponsavelCache = null;
function normalizarNomePessoa(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
async function carregarListaResponsaveis() {
  if (!usuariosResponsavelCache) {
    const r = typeof apiListarUsuariosBasico === "function" ? await apiListarUsuariosBasico() : { ok: false };
    usuariosResponsavelCache = r.ok ? (r.usuarios || []).filter((u) => u.nome) : [];
  }
  const dl = document.getElementById("listaResponsaveisDatalist");
  if (!dl) return;
  dl.innerHTML = usuariosResponsavelCache
    .slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((u) => `<option value="${escaparHtml(u.nome)}"></option>`).join("");
}
function aplicarResponsavelDoCampo() {
  const el = document.getElementById("campoResponsavel");
  if (!el || !propostaEmEdicao) return;
  const alvo = normalizarNomePessoa(el.value);
  let registro = null;
  if (alvo) {
    const achado = (usuariosResponsavelCache || []).find((u) => normalizarNomePessoa(u.nome) === alvo);
    if (achado) { registro = String(achado.registro); el.value = achado.nome; }
    else if (alvo === normalizarNomePessoa(localStorage.getItem("userNome"))) registro = localStorage.getItem("userId") || null;
  }
  propostaEmEdicao.responsavelNome = el.value.trim();
  propostaEmEdicao.responsavelRegistro = registro;
}

// ====================================================
// CAMPOS NOVOS: local, dados internos da visita, desconto, parcelas,
// garantia
// ====================================================
function preencherCamposExtrasOrcamento() {
  const p = propostaEmEdicao;
  const val = (id, v) => { const el = document.getElementById(id); if (el) el.value = v === undefined || v === null ? "" : v; };
  val("campoLocalDescricao", p.localDescricao);
  val("campoDadosVisitaInterno", p.dadosVisitaInterno);
  val("descontoMaoDeObra", p.descontoMaoDeObra ? String(p.descontoMaoDeObra).replace(".", ",") : "");
  val("descontoTipoMaoDeObra", p.descontoTipoMaoDeObra || "rs");
  val("descontoMateriais", p.descontoMateriais ? String(p.descontoMateriais).replace(".", ",") : "");
  val("descontoTipoMateriais", p.descontoTipoMateriais || "rs");
  val("campoEntradaPerc", p.entradaPerc ? String(p.entradaPerc).replace(".", ",") : "");
  val("campoParcelas", p.parcelas || "");
  val("campoPrazosParcelas", p.prazosParcelas);
  val("campoGarantia", p.garantia);
}
function coletarCamposExtrasOrcamento() {
  if (!propostaEmEdicao) return;
  const p = propostaEmEdicao;
  const txt = (id) => (document.getElementById(id)?.value || "").trim();
  p.localDescricao = txt("campoLocalDescricao");
  p.dadosVisitaInterno = txt("campoDadosVisitaInterno");
  p.descontoMaoDeObra = numeroDigitadoProposta(txt("descontoMaoDeObra"));
  p.descontoTipoMaoDeObra = txt("descontoTipoMaoDeObra") || "rs";
  p.descontoMateriais = numeroDigitadoProposta(txt("descontoMateriais"));
  p.descontoTipoMateriais = txt("descontoTipoMateriais") || "rs";
  p.entradaPerc = Math.min(100, numeroDigitadoProposta(txt("campoEntradaPerc")));
  p.parcelas = Math.max(0, Math.min(60, parseInt(txt("campoParcelas"), 10) || 0));
  p.prazosParcelas = txt("campoPrazosParcelas");
  p.garantia = txt("campoGarantia");
}

function fecharFormularioProposta() {
  const modal = document.getElementById("modalProposta");
  if (modal) modal.classList.remove("active");
  esconderPainelFotosVisita();
  // NÃO apaga o rascunho aqui — fechar o modal sem salvar é exatamente
  // o caso que o rascunho existe pra cobrir. Ele continua no servidor,
  // marcado como "Pendente", até o usuário voltar e finalizar de verdade.
  propostaEmEdicao = null;
  rascunhoAtualId = null;
  if (onListaPendentesAtualizarCallback) onListaPendentesAtualizarCallback();
}

// ====================================================
// RASCUNHO AUTOMÁTICO (auto-save)
// ====================================================

// Reaproveita a mesma leitura de campos que salvarFormularioProposta
// usa, mas sem validação — um rascunho pode ficar incompleto, só uma
// proposta finalizada precisa ter cliente preenchido.
function coletarCamposBasicosDoFormulario() {
  if (!propostaEmEdicao) return;
  const campo = (id) => document.getElementById(id);
  propostaEmEdicao.numeroOrcamento = (campo("campoNumeroOrcamento")?.value || "").trim();
  propostaEmEdicao.cliente = (campo("campoCliente")?.value || "").trim();
  aplicarResponsavelDoCampo();
  propostaEmEdicao.documentoCliente = (campo("campoDocumentoCliente")?.value || "").trim();
  propostaEmEdicao.telefone = (campo("campoTelefone")?.value || "").trim();
  propostaEmEdicao.local = (campo("campoLocal")?.value || "").trim();
  propostaEmEdicao.servico = (campo("campoServico")?.value || "").trim();
  propostaEmEdicao.observacao = (campo("campoObservacao")?.value || "").trim();
  propostaEmEdicao.formaPagamento = (campo("campoFormaPagamento")?.value || "").trim();
  propostaEmEdicao.planejamentoDias = campo("campoPlanejamento")?.value || "";
  propostaEmEdicao.validadeDias = campo("campoValidade")?.value || "";
  coletarCamposExtrasOrcamento();
  coletarImpostosDoFormulario();
}

// Só vale a pena salvar (e criar) um rascunho se o usuário já digitou
// alguma coisa — evita gerar um rascunho vazio só porque alguém abriu
// e fechou o modal sem preencher nada.
function formularioTemConteudoParaRascunho() {
  if (!propostaEmEdicao) return false;
  const p = propostaEmEdicao;
  const camposTexto = [p.numeroOrcamento, p.cliente, p.telefone, p.local, p.servico, p.observacao, p.formaPagamento, p.localDescricao, p.dadosVisitaInterno];
  if (camposTexto.some((v) => (v || "").trim() !== "")) return true;
  if ((p.itensMaoDeObra || []).some((i) => (i.descricao || "").trim() !== "")) return true;
  if ((p.itensMateriais || []).some((i) => (i.nome || "").trim() !== "")) return true;
  return false;
}

async function salvarRascunhoAtual() {
  if (!propostaEmEdicao || salvandoPropostaDeVerdade) return;
  coletarCamposBasicosDoFormulario();
  if (!formularioTemConteudoParaRascunho()) return;

  const resposta = await apiSalvarRascunhoProposta(rascunhoAtualId, propostaEmEdicao);
  const statusEl = document.getElementById("statusRascunhoProposta");
  if (resposta.ok) {
    rascunhoAtualId = resposta.id;
    if (statusEl) {
      const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      statusEl.textContent = `Pendente — rascunho salvo automaticamente às ${agora}.`;
    }
    if (onListaPendentesAtualizarCallback) onListaPendentesAtualizarCallback();
  } else if (statusEl) {
    statusEl.textContent = "Não foi possível salvar o rascunho agora. Suas alterações continuam só nesta tela.";
  }
}

// Versão sem esperar resposta do servidor — usada quando a aba está
// sendo fechada/trocada, momento em que não dá mais pra esperar um
// await terminar antes do navegador seguir em frente.
function salvarRascunhoAtualImediato() {
  if (!propostaEmEdicao || salvandoPropostaDeVerdade) return;
  coletarCamposBasicosDoFormulario();
  if (!formularioTemConteudoParaRascunho()) return;
  if (!rascunhoAtualId) rascunhoAtualId = `rascunho_${Date.now()}`;
  apiSalvarRascunhoPropostaImediato(rascunhoAtualId, propostaEmEdicao);
}

// Dispara ao trocar de aba (a aba atual fica oculta) e ao fechar a
// aba/navegador. Cobre os dois casos pedidos: "trocando de aba" e
// "fechando a aba". Um desligamento abrupto do PC não emite nenhum
// evento — por isso o auto-save por campo (blur) é a proteção real
// pra esse caso: quando ele acontece, o rascunho já foi salvo há
// segundos, não depende de detectar o desligamento.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") salvarRascunhoAtualImediato();
});
window.addEventListener("beforeunload", salvarRascunhoAtualImediato);

// ============================================================
// Calcula o valor final de um item:
// - Se valorFinal foi digitado diretamente, usa ele.
// - Caso contrário, calcula qtd * valorUnit.
// ============================================================
function valorFinalItem(item) {
  if (item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "") {
    return parseFloat(item.valorFinal) || 0;
  }
  return (parseFloat(item.qtd) || 0) * (parseFloat(item.valorUnit) || 0);
}

// ====================================================
// TABELA: MÃO DE OBRA
// ====================================================
function atualizarDatalistServicos() {
  const datalist = document.getElementById("listaServicosPropostaDatalist");
  if (!datalist) return;
  datalist.innerHTML = servicosCatalogoCache.map((s) => `<option value="${escaparHtml(s.nome)}"></option>`).join("");
}

function renderTabelaMaoDeObra() {
  const tbody = document.querySelector("#tabelaMaoDeObra tbody");
  tbody.innerHTML = "";
  propostaEmEdicao.itensMaoDeObra.forEach((item, index) => {
    const tr = document.createElement("tr");
    const vf = valorFinalItem(item);
    // Se valorFinal está preenchido, desabilita Qtd e Valor Unit
    const bloqueado = item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "";
    const vinculado = !!item.servicoId;
    const rotuloVinculo = ""; // etiqueta "catálogo" removida a pedido — o vínculo continua funcionando
    tr.innerHTML = `
      <td class="col-descricao">
        ${rotuloVinculo}
        <input type="text" value="${escaparHtml(item.descricao || "")}" placeholder="Descrição do serviço"
          data-mo-campo="descricao" data-mo-index="${index}" />
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${item.qtd || ""}"
          placeholder="Qtd" data-mo-campo="qtd" data-mo-index="${index}"
          ${bloqueado ? 'disabled style="opacity:0.4;"' : ''} />
      </td>
      <td>
        <select data-mo-campo="unid" data-mo-index="${index}">${opcoesUnidadeHtml(item.unid)}</select>
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${item.valorUnit || ""}"
          placeholder="R$" data-mo-campo="valorUnit" data-mo-index="${index}"
          ${bloqueado ? 'disabled style="opacity:0.4;"' : ''} />
      </td>
      <td>
        <input type="number" min="0" step="0.01"
          value="${item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "" ? item.valorFinal : ""}"
          placeholder="R$ final" data-mo-campo="valorFinal" data-mo-index="${index}"
          style="font-weight:700;color:rgb(196, 78, 0);" />
        <small style="display:block;font-size:10px;color:#aaa;">
          ${!bloqueado ? "= R$ " + formatarMoeda(vf) : "valor fixo"}
        </small>
      </td>
      <td><button type="button" class="btn-remover-item" data-mo-remover="${index}">&times;</button></td>
    `;
    tr.className = "linha-item-principal";
    tbody.appendChild(tr);
    tbody.appendChild(criarLinhaObservacoesItem(item, index, "mo"));
  });

  tbody.querySelectorAll("[data-mo-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = parseInt(input.dataset.moIndex, 10);
      const campo = input.dataset.moCampo;
      if (campo === "qtd" || campo === "valorUnit") {
        propostaEmEdicao.itensMaoDeObra[idx][campo] = parseFloat(input.value) || 0;
      } else if (campo === "valorFinal") {
        // Valor Final preenchido sobrescreve o cálculo automático
        propostaEmEdicao.itensMaoDeObra[idx].valorFinal = input.value === "" ? null : parseFloat(input.value) || 0;
        // Rerender só após blur para não perder foco enquanto digita
      } else {
        propostaEmEdicao.itensMaoDeObra[idx][campo] = input.value;
      }

      const item = propostaEmEdicao.itensMaoDeObra[idx];
      const linha = input.closest("tr");
      const vf = valorFinalItem(item);
      const small = linha.querySelector("small");
      if (small) {
        const bloqueado = item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "";
        small.textContent = bloqueado ? "valor fixo" : "= R$ " + formatarMoeda(vf);
      }

      atualizarTotaisFormulario();
    });

    // Descrição que bate com um serviço já cadastrado: liga o item a
    // ele e preenche o valor (só se ainda estiver vazio).
    if (input.dataset.moCampo === "descricao") {
      criarAutocompleteCustomizado(input, () => servicosCatalogoCache.map((s) => s.nome), null, (nome) => {
        const s = servicosCatalogoCache.find((x) => x.nome === nome);
        return s && s.valor ? `R$ ${formatarMoeda(Number(s.valor))}` : "";
      });
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset.moIndex, 10);
        const item = propostaEmEdicao.itensMaoDeObra[idx];
        const servico = servicosCatalogoCache.find((s) => s.nome.trim().toLowerCase() === input.value.trim().toLowerCase());
        if (servico) {
          item.servicoId = servico.id;
          if (!item.valorUnit) {
            item.valorUnit = servico.valor;
            renderTabelaMaoDeObra();
            atualizarTotaisFormulario();
          }
        } else {
          item.servicoId = null; // descrição nova/alterada — deixa de estar vinculada até salvar
        }
      });
    }

    // Ao sair do campo valorFinal, rerenderiza para habilitar/desabilitar os outros
    if (input.dataset.moCampo === "valorFinal") {
      input.addEventListener("blur", async (ev) => {
        const destino = ev.relatedTarget;
        const idx = parseInt(input.dataset.moIndex, 10);
        const item = propostaEmEdicao.itensMaoDeObra[idx];
        if (item.servicoId) {
          const sincronizar = await perguntarSincronizarServico(item.descricao);
          if (sincronizar) await atualizarServicoNoCatalogo(item.servicoId, { nome: item.descricao, valorUnit: item.valorUnit });
        }
        renderTabelaMaoDeObra();
        atualizarTotaisFormulario();
        restaurarFocoNaTabela(destino, "tabelaMaoDeObra", "mo");
      });
    }
  });

  tbody.querySelectorAll("[data-mo-remover]").forEach((btn) => {
    btn.addEventListener("click", () => {
      propostaEmEdicao.itensMaoDeObra.splice(parseInt(btn.dataset.moRemover, 10), 1);
      renderTabelaMaoDeObra();
      atualizarTotaisFormulario();
    });
  });
}

function adicionarLinhaMaoDeObra() {
  propostaEmEdicao.itensMaoDeObra.push({ qtd: null, unid: "UND", descricao: "", valorUnit: null, valorFinal: null, servicoId: null, obsCliente: "", obsInterna: "" });
  renderTabelaMaoDeObra();
  atualizarTotaisFormulario();
}

// ====================================================
// CHECKLIST DE MATERIAIS DO ESTOQUE
// ====================================================
function renderChecklistMateriaisEstoque() {
  const container = document.getElementById("checklistMateriaisEstoque");
  if (!container) return; // seção removida — a escolha é feita pela lista de pesquisa
  const estoque = lerMateriaisEstoque();

  if (estoque.length === 0) {
    container.innerHTML = '<p class="texto-ajuda">Nenhum material cadastrado ainda no estoque.</p>';
    return;
  }

  const idsJaAdicionados = new Set(
    propostaEmEdicao.itensMateriais
      .map((item) => item.materialId)
      .filter((id) => id !== null && id !== undefined)
  );

  container.innerHTML = "";
  estoque.forEach((material) => {
    const linha = document.createElement("label");
    linha.className = "checklist-item-material";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = idsJaAdicionados.has(material.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        propostaEmEdicao.itensMateriais.push({
          qtd: 1, unid: material.unidade || "un", nome: material.nome,
          valorUnit: material.valor, valorFinal: null, materialId: material.id,
          obsCliente: "", obsInterna: "",
        });
      } else {
        propostaEmEdicao.itensMateriais = propostaEmEdicao.itensMateriais.filter(
          (item) => item.materialId !== material.id
        );
      }
      renderTabelaMateriais();
      atualizarTotaisFormulario();
    });
    linha.appendChild(checkbox);
    linha.appendChild(document.createTextNode(`${material.nome} — R$ ${formatarMoeda(material.valor)}${material.setor ? " (" + material.setor + ")" : ""}`));
    container.appendChild(linha);
  });
}

// ====================================================
// TABELA: MATERIAIS
// ====================================================
function renderTabelaMateriais() {
  const tbody = document.querySelector("#tabelaMateriais tbody");
  tbody.innerHTML = "";

  propostaEmEdicao.itensMateriais.forEach((item, index) => {
    const tr = document.createElement("tr");
    const vf = valorFinalItem(item);
    const vinculado = item.materialId !== null && item.materialId !== undefined;
    const bloqueado = item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "";
    const rotuloVinculo = ""; // etiqueta "estoque" removida a pedido — o vínculo continua funcionando

    tr.innerHTML = `
      <td class="col-descricao">
        ${rotuloVinculo}
        <input type="text" value="${escaparHtml(item.nome || "")}" placeholder="Nome do material"
          data-mat-campo="nome" data-mat-index="${index}" />
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${item.qtd || ""}"
          placeholder="Qtd" data-mat-campo="qtd" data-mat-index="${index}"
          ${bloqueado ? 'disabled style="opacity:0.4;"' : ''} />
      </td>
      <td>
        <select data-mat-campo="unid" data-mat-index="${index}">${opcoesUnidadeHtml(item.unid)}</select>
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${item.valorUnit || ""}"
          placeholder="R$" data-mat-campo="valorUnit" data-mat-index="${index}"
          ${bloqueado ? 'disabled style="opacity:0.4;"' : ''} />
      </td>
      <td>
        <input type="number" min="0" step="0.01"
          value="${item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "" ? item.valorFinal : ""}"
          placeholder="R$ final" data-mat-campo="valorFinal" data-mat-index="${index}"
          style="font-weight:700;color:rgb(196, 78, 0);" />
        <small style="display:block;font-size:10px;color:#aaa;">
          ${!bloqueado ? "= R$ " + formatarMoeda(vf) : "valor fixo"}
        </small>
      </td>
      <td><button type="button" class="btn-remover-item" data-mat-remover="${index}">&times;</button></td>
    `;
    tr.className = "linha-item-principal";
    tbody.appendChild(tr);
    tbody.appendChild(criarLinhaObservacoesItem(item, index, "mat"));
  });

  tbody.querySelectorAll("[data-mat-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = parseInt(input.dataset.matIndex, 10);
      const campo = input.dataset.matCampo;
      const item = propostaEmEdicao.itensMateriais[idx];

      if (campo === "qtd" || campo === "valorUnit") {
        item[campo] = parseFloat(input.value) || 0;
      } else if (campo === "valorFinal") {
        item.valorFinal = input.value === "" ? null : parseFloat(input.value) || 0;
      } else {
        item[campo] = input.value;
      }

      const vf = valorFinalItem(item);
      const small = input.closest("tr").querySelector("small");
      if (small) {
        const bloqueado = item.valorFinal !== undefined && item.valorFinal !== null && item.valorFinal !== "";
        small.textContent = bloqueado ? "valor fixo" : "= R$ " + formatarMoeda(vf);
      }

      atualizarTotaisFormulario();
    });

    // Nome que bate com um material já cadastrado: liga o item a ele
    // e preenche o valor (só se ainda estiver vazio) — mesma lógica
    // que a Mão de Obra já tinha com Serviços, mas Material nunca
    // tinha isso.
    if (input.dataset.matCampo === "nome") {
      criarAutocompleteCustomizado(input, () => materiaisEstoqueCache.map((m) => m.nome), null, (nome) => {
        const m = materiaisEstoqueCache.find((x) => x.nome === nome);
        return m && m.valor ? `R$ ${formatarMoeda(Number(m.valor))}` : "";
      });
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset.matIndex, 10);
        const item = propostaEmEdicao.itensMateriais[idx];
        const material = materiaisEstoqueCache.find((m) => m.nome.trim().toLowerCase() === input.value.trim().toLowerCase());
        if (material) {
          item.materialId = material.id;
          if (!item.valorUnit) {
            item.valorUnit = material.valor;
            renderTabelaMateriais();
            atualizarTotaisFormulario();
          }
        }
      });
    }

    if (input.dataset.matCampo === "valorFinal") {
      input.addEventListener("blur", async (ev) => {
        const destino = ev.relatedTarget;
        const idx = parseInt(input.dataset.matIndex, 10);
        const item = propostaEmEdicao.itensMateriais[idx];
        if (item.materialId) {
          const sincronizar = await perguntarSincronizarMaterial(item.nome);
          if (sincronizar) await atualizarMaterialNoEstoque(item.materialId, item);
        }
        renderTabelaMateriais();
        atualizarTotaisFormulario();
        restaurarFocoNaTabela(destino, "tabelaMateriais", "mat");
      });
    }
  });

  tbody.querySelectorAll("[data-mat-remover]").forEach((btn) => {
    btn.addEventListener("click", () => {
      propostaEmEdicao.itensMateriais.splice(parseInt(btn.dataset.matRemover, 10), 1);
      renderChecklistMateriaisEstoque();
      renderTabelaMateriais();
      atualizarTotaisFormulario();
    });
  });
}

function adicionarLinhaMaterial() {
  propostaEmEdicao.itensMateriais.push({ qtd: null, unid: "UND", nome: "", valorUnit: null, valorFinal: null, materialId: null, obsCliente: "", obsInterna: "" });
  renderTabelaMateriais();
  atualizarTotaisFormulario();
}

// ====================================================
// TOTAIS
// ====================================================
function totalMaoDeObraForm(proposta) {
  return (proposta.itensMaoDeObra || []).reduce((s, item) => s + valorFinalItem(item), 0);
}
function totalMateriaisForm(proposta) {
  return (proposta.itensMateriais || []).reduce((s, item) => s + valorFinalItem(item), 0);
}

function atualizarTotaisFormulario() {
  const subtotalMO  = totalMaoDeObraForm(propostaEmEdicao);
  const subtotalMat = totalMateriaisForm(propostaEmEdicao);
  const ajusteMO    = parseFloat(document.getElementById("ajusteMaoDeObra")?.value) || 0;
  const ajusteMat   = parseFloat(document.getElementById("ajusteMateriais")?.value) || 0;
  coletarCamposExtrasOrcamento();
  const descMO      = valorDescontoProposta(subtotalMO, propostaEmEdicao.descontoMaoDeObra, propostaEmEdicao.descontoTipoMaoDeObra);
  const descMat     = valorDescontoProposta(subtotalMat, propostaEmEdicao.descontoMateriais, propostaEmEdicao.descontoTipoMateriais);
  const totalMO     = subtotalMO - descMO + ajusteMO;
  const totalMat    = subtotalMat - descMat + ajusteMat;
  const totalGeral  = totalMO + totalMat;
  const txtDescMO = document.getElementById("descontoTextoMaoDeObra");
  if (txtDescMO) txtDescMO.textContent = descMO ? `(− R$ ${formatarMoeda(descMO)})` : "";
  const txtDescMat = document.getElementById("descontoTextoMateriais");
  if (txtDescMat) txtDescMat.textContent = descMat ? `(− R$ ${formatarMoeda(descMat)})` : "";
  const previa = document.getElementById("previaPagamento");
  if (previa) {
    const linhas = linhasCondicaoPagamento({ ...propostaEmEdicao, _totalForcado: totalGeral }, true);
    previa.innerHTML = linhas.length ? "<b>Como sai no PDF:</b> " + linhas.map(escaparHtml).join(" ") : "";
  }

  const subtotalMOEl = document.getElementById("subtotalMaoDeObraTexto");
  if (subtotalMOEl) subtotalMOEl.textContent = `R$ ${formatarMoeda(subtotalMO)}`;
  document.getElementById("totalMaoDeObraTexto").textContent = `R$ ${formatarMoeda(totalMO)}`;

  const subtotalMatEl = document.getElementById("subtotalMateriaisTexto");
  if (subtotalMatEl) subtotalMatEl.textContent = `R$ ${formatarMoeda(subtotalMat)}`;
  document.getElementById("totalMateriaisTexto").textContent = `R$ ${formatarMoeda(totalMat)}`;

  document.getElementById("totalGeralTexto").textContent = `R$ ${formatarMoeda(totalGeral)}`;

  // Salva os ajustes na proposta para serem gravados
  propostaEmEdicao.ajusteMaoDeObra = ajusteMO;
  propostaEmEdicao.ajusteMateriais = ajusteMat;

  atualizarResumoImpostos();
}

// ====================================================
// SALVAR
// ====================================================
async function salvarFormularioProposta() {
  salvandoPropostaDeVerdade = true;
  const campoCliente = document.getElementById("campoCliente");
  limparErrosDoFormulario(document.getElementById("modalProposta"));

  propostaEmEdicao.numeroOrcamento = document.getElementById("campoNumeroOrcamento").value.trim();
  propostaEmEdicao.cliente = campoCliente.value.trim();
  aplicarResponsavelDoCampo();
  propostaEmEdicao.documentoCliente = document.getElementById("campoDocumentoCliente").value.trim();
  propostaEmEdicao.telefone = document.getElementById("campoTelefone").value.trim();
  propostaEmEdicao.local = document.getElementById("campoLocal").value.trim();
  propostaEmEdicao.servico = document.getElementById("campoServico").value.trim();
  propostaEmEdicao.observacao = document.getElementById("campoObservacao").value.trim();
  propostaEmEdicao.formaPagamento = document.getElementById("campoFormaPagamento").value.trim();
  propostaEmEdicao.planejamentoDias = document.getElementById("campoPlanejamento").value;
  propostaEmEdicao.validadeDias = document.getElementById("campoValidade").value;
  coletarCamposExtrasOrcamento();
  coletarImpostosDoFormulario();

  if (!propostaEmEdicao.cliente) {
    marcarCampoComErro(campoCliente, "Informe o nome do cliente.");
    focarPrimeiroErro(document.getElementById("modalProposta"));
    salvandoPropostaDeVerdade = false;
    return;
  }

  const botaoSalvar = document.getElementById("btnSalvarProposta");
  const textoOriginalBotao = botaoSalvar.textContent;
  botaoSalvar.disabled = true;
  botaoSalvar.textContent = "Salvando...";

  try {
    // Qualquer item de material/mão de obra digitado manualmente (sem
    // ter sido escolhido do catálogo) vira uma entrada nova no
    // catálogo agora — assim fica disponível depois em Gestão de
    // Material / na NFS-e, sem precisar cadastrar de novo. Cada item
    // tem seu próprio try/catch: se UM falhar ao cadastrar no
    // catálogo, os outros continuam normalmente, e o item em si
    // nunca é removido da proposta por causa disso.
    for (const item of propostaEmEdicao.itensMateriais) {
      if (!item.materialId && item.nome && item.nome.trim()) {
        try {
          item.materialId = await garantirMaterialNoCatalogo(item.nome, item.valorUnit);
        } catch (e) {
          console.warn("[propostas-form] Falha ao cadastrar material no catálogo:", item.nome, e);
        }
      }
    }
    for (const item of propostaEmEdicao.itensMaoDeObra) {
      if (!item.servicoId && item.descricao && item.descricao.trim()) {
        try {
          item.servicoId = await garantirServicoNoCatalogo(item.descricao, item.valorUnit);
        } catch (e) {
          console.warn("[propostas-form] Falha ao cadastrar serviço no catálogo:", item.descricao, e);
        }
      }
    }

    // Mesma lógica: se o cliente digitado ainda não existe em
    // Contatos, cria um registro básico lá agora — já com o
    // documento, se a pessoa preencheu (não é obrigatório aqui).
    await garantirClienteEmContatos(propostaEmEdicao.cliente, propostaEmEdicao.telefone, propostaEmEdicao.documentoCliente);

    await salvarProposta(propostaEmEdicao);

    // Orçamento criado a partir de uma visita: marca a visita como
    // "já virou orçamento" (ela sai da lista de visitas aguardando).
    if (propostaEmEdicao.visitaId) await marcarVisitaComoOrcada(propostaEmEdicao.visitaId, propostaEmEdicao.id);

    // Proposta finalizada de verdade — o rascunho que vinha sendo
    // salvo automaticamente não faz mais sentido, apaga ele.
    if (rascunhoAtualId) {
      await apiExcluirRascunhoProposta(rascunhoAtualId);
      rascunhoAtualId = null;
    }

    fecharFormularioProposta();
    if (onSalvarPropostaCallback) onSalvarPropostaCallback();
  } finally {
    salvandoPropostaDeVerdade = false;
    botaoSalvar.disabled = false;
    botaoSalvar.textContent = textoOriginalBotao;
  }
}

// ====================================================
// OBSERVAÇÕES POR ITEM (cliente / interna)
// ====================================================
// Linha extra logo abaixo de cada item. Usa os mesmos atributos
// data-mo-campo / data-mat-campo dos outros campos, então o listener
// "input" que já existe na tabela grava o texto no item sozinho, e o
// "focusout" da tabela já salva o rascunho.
function criarLinhaObservacoesItem(item, index, prefixo) {
  const tr = document.createElement("tr");
  tr.className = "linha-obs-item";
  tr.innerHTML = `
    <td colspan="6">
      <div class="obs-item-grid">
        <label class="obs-cliente">Observação para o cliente
          <textarea rows="1" placeholder="Aparece no PDF do cliente"
            data-${prefixo}-campo="obsCliente" data-${prefixo}-index="${index}">${escaparHtml(item.obsCliente || "")}</textarea>
        </label>
        <label class="obs-interna"><span>Observação interna <span class="tag-interno">só empresa</span></span>
          <textarea rows="1" placeholder="Só aparece no PDF interno"
            data-${prefixo}-campo="obsInterna" data-${prefixo}-index="${index}">${escaparHtml(item.obsInterna || "")}</textarea>
        </label>
      </div>
    </td>
  `;
  return tr;
}

// Ao sair do "Valor Final" a tabela é redesenhada — sem isto, o campo
// em que a pessoa acabou de clicar (ex.: a observação logo abaixo)
// sumia e ela tinha que clicar de novo.
function restaurarFocoNaTabela(destino, idTabela, prefixo) {
  if (!destino || !destino.dataset) return;
  const campo = destino.dataset[prefixo + "Campo"];
  const indice = destino.dataset[prefixo + "Index"];
  if (!campo || indice === undefined) return;
  const novo = document.querySelector(`#${idTabela} [data-${prefixo}-campo="${campo}"][data-${prefixo}-index="${indice}"]`);
  if (novo && !novo.disabled) novo.focus();
}

// ====================================================
// IMPOSTOS — formulário
// ====================================================
function preencherCamposImpostos() {
  if (!propostaEmEdicao) return;
  const imp = propostaEmEdicao.impostos || impostosPadraoParaProposta(chaveMesImpostosOrc());
  document.getElementById("campoLocalObra").value = propostaEmEdicao.localObra || "curitiba";
  document.getElementById("campoMesImpostosOrc").innerHTML = opcoesMesesImpostosHtml(imp.mesRef);
  document.getElementById("campoInssOrc").value = imp.inss || "";
  document.getElementById("campoIssOrc").value = imp.iss || "";
  document.getElementById("campoMatOrc").value = imp.material || "";
}

function coletarImpostosDoFormulario() {
  if (!propostaEmEdicao) return;
  const el = (id) => document.getElementById(id);
  if (!el("campoLocalObra")) return;
  propostaEmEdicao.localObra = el("campoLocalObra").value || "curitiba";
  propostaEmEdicao.impostos = {
    mesRef: el("campoMesImpostosOrc").value || chaveMesImpostosOrc(),
    inss: parseFloat(el("campoInssOrc").value) || 0,
    iss: parseFloat(el("campoIssOrc").value) || 0,
    material: parseFloat(el("campoMatOrc").value) || 0,
  };
}

function atualizarResumoImpostos() {
  const tbody = document.getElementById("resumoImpostosOrc");
  if (!tbody || !propostaEmEdicao) return;
  const imp = calcularImpostosProposta(propostaEmEdicao);

  // Em Curitiba o ISS fica apagado (o valor digitado é mantido, só não conta)
  const rotuloIss = document.getElementById("rotuloIssOrc");
  if (rotuloIss) rotuloIss.classList.toggle("iss-inativo", imp.emCuritiba);

  const pct = (v) => `${String(v).replace(".", ",")}%`;
  const linha = (rotulo, detalhe, valor, classe) => `
    <tr class="${classe || ""}">
      <td>${rotulo}</td>
      <td class="detalhe">${detalhe}</td>
      <td class="valor">${valor}</td>
    </tr>`;

  tbody.innerHTML =
    linha("INSS", `${pct(imp.inssPerc)} de R$ ${formatarMoeda(imp.baseMO)} (M.O.)`, `- R$ ${formatarMoeda(imp.valorInss)}`) +
    linha("ISS", imp.emCuritiba ? "Não entra (obra em Curitiba)" : `${pct(imp.issPerc)} de R$ ${formatarMoeda(imp.baseMO)} (M.O.)`, `- R$ ${formatarMoeda(imp.valorIss)}`) +
    linha("Material", `${pct(imp.matPerc)} de R$ ${formatarMoeda(imp.baseMat)} (Materiais)`, `- R$ ${formatarMoeda(imp.valorMat)}`) +
    linha("Total de impostos", "", `- R$ ${formatarMoeda(imp.total)}`, "linha-total-impostos") +
    linha("Valor líquido", "Total geral − impostos", `R$ ${formatarMoeda(imp.liquido)}`, "linha-liquido");
}

// ====================================================
// IMPOSTOS DO MÊS — tabela padrão (mesma da Comissão)
// ====================================================
function montarModalImpostosMes() {
  if (document.getElementById("modalImpostosMes")) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modalImpostosMes";
  overlay.style.zIndex = "1100"; // pode abrir por cima do formulário do orçamento
  overlay.innerHTML = `
    <div class="modal-caixa-grande" style="max-width:460px;">
      <div class="modal-cabecalho">
        <h2>Impostos do mês</h2>
        <button type="button" class="modal-fechar" id="fecharModalImpostosMes">&times;</button>
      </div>
      <p class="texto-ajuda">
        % padrão de cada mês. Todo orçamento novo copia as % do mês dele — e dá para ajustar
        dentro do orçamento. É a mesma tabela usada na tela de Comissão.
      </p>
      <div class="form-secao">
        <div class="form-grid">
          <label class="campo-largura-total">Mês
            <select id="campoMesTabelaImpostos"></select>
          </label>
          <label>INSS %
            <input type="number" id="campoInssTabela" min="0" max="100" step="0.01" placeholder="0" />
          </label>
          <label>ISS %
            <input type="number" id="campoIssTabela" min="0" max="100" step="0.01" placeholder="0" />
          </label>
          <label class="campo-largura-total">Imposto de material %
            <input type="number" id="campoMatTabela" min="0" max="100" step="0.01" placeholder="0" />
          </label>
        </div>
      </div>
      <div class="modal-rodape">
        <button type="button" class="btn-secundario" id="btnCancelarImpostosMes">Cancelar</button>
        <button type="button" class="btn-laranja" id="btnSalvarImpostosMes">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.classList.remove("active");
  document.getElementById("fecharModalImpostosMes").addEventListener("click", fechar);
  document.getElementById("btnCancelarImpostosMes").addEventListener("click", fechar);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  document.getElementById("campoMesTabelaImpostos").addEventListener("change", preencherCamposTabelaImpostos);
  document.getElementById("btnSalvarImpostosMes").addEventListener("click", salvarTabelaImpostosMes);
}

function preencherCamposTabelaImpostos() {
  const chave = document.getElementById("campoMesTabelaImpostos").value;
  const taxas = taxasPadraoDoMesOrc(chave);
  document.getElementById("campoInssTabela").value = taxas.inss || "";
  document.getElementById("campoIssTabela").value = taxas.iss || "";
  document.getElementById("campoMatTabela").value = taxas.material || "";
}

async function abrirModalImpostosMes(chaveInicial) {
  montarModalImpostosMes();
  await carregarTabelaImpostosMes();
  const chave = chaveInicial || chaveMesImpostosOrc();
  document.getElementById("campoMesTabelaImpostos").innerHTML = opcoesMesesImpostosHtml(chave);
  preencherCamposTabelaImpostos();
  document.getElementById("modalImpostosMes").classList.add("active");
}

async function salvarTabelaImpostosMes() {
  const botao = document.getElementById("btnSalvarImpostosMes");
  const chave = document.getElementById("campoMesTabelaImpostos").value;
  const novas = {
    inss: parseFloat(document.getElementById("campoInssTabela").value) || 0,
    iss: parseFloat(document.getElementById("campoIssTabela").value) || 0,
    material: parseFloat(document.getElementById("campoMatTabela").value) || 0,
  };

  botao.disabled = true;
  try {
    // Relê antes de gravar: se alguém salvou outro mês agora há pouco
    // (aqui ou na Comissão), não apaga o que a outra pessoa fez.
    const tabela = await carregarTabelaImpostosMes();
    tabela[chave] = { ...(tabela[chave] || {}), ...novas };
    const resp = await apiDataSet(CHAVE_TABELA_IMPOSTOS_MES, tabela);
    if (!resp || !resp.ok) {
      mostrarToast((resp && resp.erro) || "Não foi possível salvar os impostos do mês.", "erro");
      return;
    }
    tabelaImpostosMesCache = tabela;
    mostrarToast(`Impostos de ${rotuloMesImpostosOrc(chave)} salvos.`);
    document.getElementById("modalImpostosMes").classList.remove("active");

    // Se o orçamento aberto usa esse mês, já aplica as % novas nele.
    if (propostaEmEdicao && propostaEmEdicao.impostos && propostaEmEdicao.impostos.mesRef === chave) {
      propostaEmEdicao.impostos = impostosPadraoParaProposta(chave);
      preencherCamposImpostos();
      atualizarResumoImpostos();
    }
  } finally {
    botao.disabled = false;
  }
}

// ====================================================
// LINKS DOS MATERIAIS (só empresa) — nome do produto + link de onde
// comprar. Fica em propostaEmEdicao.linksMateriais e vai junto no
// rascunho e no orçamento salvo. Nunca entra no PDF do cliente.
// ====================================================
function normalizarLinkMaterial(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

function renderLinksMateriais() {
  const lista = document.getElementById("listaLinksMateriais");
  if (!lista || !propostaEmEdicao) return;
  const links = propostaEmEdicao.linksMateriais || [];
  if (!links.length) {
    lista.innerHTML = '<p class="links-vazio">Nenhum link ainda.</p>';
    return;
  }
  lista.innerHTML = links.map((l, i) => `
    <div class="linha-link-material">
      <input type="text" placeholder="Nome do produto" value="${escaparHtml(l.nome || "")}" data-link-idx="${i}" data-link-campo="nome" />
      <input type="url" placeholder="Cole o link aqui" value="${escaparHtml(l.url || "")}" data-link-idx="${i}" data-link-campo="url" />
      <a class="btn-abrir-link" href="${escaparHtml(normalizarLinkMaterial(l.url) || "#")}" target="_blank" rel="noopener"
         title="Abrir o link" ${l.url ? "" : 'style="visibility:hidden"'}>Abrir ↗</a>
      <button type="button" class="btn-remover-item" data-link-remover="${i}" title="Remover">&times;</button>
    </div>
  `).join("");

  lista.querySelectorAll("[data-link-idx]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = propostaEmEdicao.linksMateriais[Number(input.dataset.linkIdx)];
      item[input.dataset.linkCampo] = input.value;
      if (input.dataset.linkCampo === "url") {
        const abrir = input.parentElement.querySelector(".btn-abrir-link");
        abrir.href = normalizarLinkMaterial(input.value) || "#";
        abrir.style.visibility = input.value.trim() ? "visible" : "hidden";
      }
    });
    input.addEventListener("blur", () => {
      if (input.dataset.linkCampo === "url" && input.value.trim()) {
        input.value = normalizarLinkMaterial(input.value);
        propostaEmEdicao.linksMateriais[Number(input.dataset.linkIdx)].url = input.value;
      }
      salvarRascunhoAtual();
    });
  });
  lista.querySelectorAll("[data-link-remover]").forEach((btn) => {
    btn.addEventListener("click", () => {
      propostaEmEdicao.linksMateriais.splice(Number(btn.dataset.linkRemover), 1);
      renderLinksMateriais();
      salvarRascunhoAtual();
    });
  });
}

function adicionarLinkMaterial(nome, url) {
  if (!propostaEmEdicao) return;
  if (!Array.isArray(propostaEmEdicao.linksMateriais)) propostaEmEdicao.linksMateriais = [];
  propostaEmEdicao.linksMateriais.push({ nome: nome || "", url: url || "" });
  renderLinksMateriais();
  // Leva o cursor direto pro campo que falta preencher
  const inputs = document.querySelectorAll(`#listaLinksMateriais [data-link-idx="${propostaEmEdicao.linksMateriais.length - 1}"]`);
  const alvo = nome ? inputs[1] : inputs[0];
  if (alvo) alvo.focus();
}

// Cria uma linha (sem link ainda) pra cada material da proposta que
// ainda não está na lista — só falta colar os links.
function puxarMateriaisParaLinks() {
  if (!propostaEmEdicao) return;
  if (!Array.isArray(propostaEmEdicao.linksMateriais)) propostaEmEdicao.linksMateriais = [];
  const jaTem = new Set(propostaEmEdicao.linksMateriais.map((l) => normalizarBusca(l.nome)));
  let novos = 0;
  (propostaEmEdicao.itensMateriais || []).forEach((m) => {
    const nome = (m.nome || "").trim();
    if (nome && !jaTem.has(normalizarBusca(nome))) {
      propostaEmEdicao.linksMateriais.push({ nome, url: "" });
      jaTem.add(normalizarBusca(nome));
      novos++;
    }
  });
  renderLinksMateriais();
  mostrarToast(novos ? `${novos} material(is) adicionado(s) — falta colar os links.` : "Todos os materiais da proposta já estão na lista.");
}

// ====================================================
// FOTOS DA VISITA NO CANTO — só pra consultar enquanto monta o
// orçamento. As fotos NÃO são copiadas pra proposta: o orçamento
// guarda só o número da visita (visitaId) pra saber quais mostrar.
// ====================================================
async function marcarVisitaComoOrcada(visitaId, propostaId) {
  try {
    const resp = await apiListarVisitas();
    const visita = resp.ok ? (resp.visitas || []).find((v) => v.id === visitaId) : null;
    if (visita && !visita.convertidaEmPropostaId) {
      await apiSalvarVisita({ ...visita, convertidaEmPropostaId: propostaId || "sim" });
    }
  } catch (e) {
    console.warn("[propostas-form] Não foi possível marcar a visita como orçada:", e);
  }
}

function montarPainelFotosVisita() {
  if (document.getElementById("painelFotosVisita")) return;
  const estilo = document.createElement("style");
  estilo.textContent = `
    /* Fica no canto INFERIOR ESQUERDO — no direito cobria o botão "Salvar Orçamento" */
    #painelFotosVisita { position: fixed; left: 16px; bottom: 16px; z-index: 1500; width: 300px; max-height: 70vh;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.28); display: none; flex-direction: column;
      font-family: 'Montserrat', sans-serif; overflow: hidden; }
    #painelFotosVisita.aberto { display: flex; }
    #btnReabrirFotosVisita { position: fixed; left: 16px; bottom: 16px; z-index: 1500; display: none; align-items: center; gap: 6px;
      background: #2b2b2b; color: #fff; border: none; border-radius: 22px; padding: 10px 16px; font-size: 13px; font-weight: 700;
      font-family: 'Montserrat', sans-serif; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    #btnReabrirFotosVisita:hover { background: #000; }
    #btnReabrirFotosVisita.visivel { display: inline-flex; }
    #painelFotosVisita .topo-pfv { display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background: #2b2b2b; color: #fff; padding: 9px 12px; cursor: pointer; user-select: none; }
    #painelFotosVisita .topo-pfv b { font-size: 13px; }
    #painelFotosVisita .topo-pfv button { background: none; border: none; color: #fff; font-size: 16px; cursor: pointer; padding: 0 2px; }
    #painelFotosVisita .corpo-pfv { padding: 10px; overflow-y: auto; }
    #painelFotosVisita.minimizado .corpo-pfv { display: none; }
    #painelFotosVisita .grade-pfv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    #painelFotosVisita .grade-pfv img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; cursor: zoom-in; }
    #painelFotosVisita .texto-pfv { font-size: 12px; color: #444; white-space: pre-wrap; margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; }
    #painelFotosVisita .anot-pfv { background: #fffbe6; border: 1px solid #f0e2a0; border-radius: 6px; padding: 8px; }
    #painelFotosVisita .vazio-pfv { font-size: 12px; color: #999; text-align: center; padding: 10px 0; }
    #zoomFotoVisita { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,.88); display: none;
      align-items: center; justify-content: center; flex-direction: column; padding: 16px; }
    #zoomFotoVisita img { max-width: 100%; max-height: 84vh; border-radius: 8px; }
    #zoomFotoVisita .nav-zoom { display: flex; gap: 10px; margin-top: 12px; }
    #zoomFotoVisita button { background: rgba(255,255,255,.15); color: #fff; border: none; border-radius: 20px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-family: inherit; }
    @media (max-width: 768px) {
      #painelFotosVisita { right: 8px; left: 8px; bottom: 8px; width: auto; max-height: 55vh; }
      #btnReabrirFotosVisita { left: 8px; bottom: 8px; padding: 8px 12px; font-size: 12px; }
    }
  `;
  document.head.appendChild(estilo);

  const painel = document.createElement("div");
  painel.id = "painelFotosVisita";
  painel.innerHTML = `
    <div class="topo-pfv" id="topoPainelFotos" title="Minimizar / abrir">
      <b id="tituloPainelFotos">📷 Fotos da visita</b>
      <span><button type="button" id="btnMinPainelFotos" aria-label="Minimizar">▾</button><button type="button" id="btnFecharPainelFotos" aria-label="Fechar">✕</button></span>
    </div>
    <div class="corpo-pfv" id="corpoPainelFotos"></div>`;
  document.body.appendChild(painel);

  // Fechou o quadro: fica um botão pequeno no canto pra abrir de novo
  const reabrir = document.createElement("button");
  reabrir.type = "button";
  reabrir.id = "btnReabrirFotosVisita";
  reabrir.innerHTML = "📷 Fotos da visita";
  reabrir.addEventListener("click", () => {
    reabrir.classList.remove("visivel");
    painel.classList.add("aberto");
    painel.classList.remove("minimizado");
    document.getElementById("btnMinPainelFotos").textContent = "▾";
  });
  document.body.appendChild(reabrir);

  const zoom = document.createElement("div");
  zoom.id = "zoomFotoVisita";
  zoom.innerHTML = `<img id="imgZoomFotoVisita" alt="" /><div class="nav-zoom">
    <button type="button" id="zoomAnterior">‹ Anterior</button><button type="button" id="zoomFechar">Fechar</button><button type="button" id="zoomProxima">Próxima ›</button></div>`;
  document.body.appendChild(zoom);

  const alternarMin = () => {
    painel.classList.toggle("minimizado");
    document.getElementById("btnMinPainelFotos").textContent = painel.classList.contains("minimizado") ? "▴" : "▾";
  };
  document.getElementById("topoPainelFotos").addEventListener("click", (e) => { if (e.target.id !== "btnFecharPainelFotos") alternarMin(); });
  document.getElementById("btnFecharPainelFotos").addEventListener("click", (e) => {
    e.stopPropagation();
    painel.classList.remove("aberto");
    reabrir.classList.add("visivel");
  });

  document.getElementById("zoomFechar").addEventListener("click", () => { zoom.style.display = "none"; });
  zoom.addEventListener("click", (e) => { if (e.target === zoom) zoom.style.display = "none"; });
  document.getElementById("zoomAnterior").addEventListener("click", () => mudarZoomFoto(-1));
  document.getElementById("zoomProxima").addEventListener("click", () => mudarZoomFoto(1));
  document.addEventListener("keydown", (e) => {
    if (zoom.style.display !== "flex") return;
    if (e.key === "Escape") zoom.style.display = "none";
    if (e.key === "ArrowLeft") mudarZoomFoto(-1);
    if (e.key === "ArrowRight") mudarZoomFoto(1);
  });
}

let fotosPainelVisita = [];
let indiceZoomFoto = 0;

function urlFotoPainelVisita(chave) {
  return `${AUTH_WORKER_URL}?action=get&key=${encodeURIComponent(chave)}&token=${encodeURIComponent(pegarTokenDownloadCache())}`;
}

function abrirZoomFoto(i) {
  indiceZoomFoto = i;
  document.getElementById("imgZoomFotoVisita").src = urlFotoPainelVisita(fotosPainelVisita[i]);
  document.getElementById("zoomFotoVisita").style.display = "flex";
}
async function mudarZoomFoto(passo) {
  if (!fotosPainelVisita.length) return;
  await garantirTokenDownload();
  abrirZoomFoto((indiceZoomFoto + passo + fotosPainelVisita.length) % fotosPainelVisita.length);
}

async function mostrarPainelFotosVisita(visitaId) {
  montarPainelFotosVisita();
  const painel = document.getElementById("painelFotosVisita");
  const corpo = document.getElementById("corpoPainelFotos");
  painel.classList.add("aberto");
  document.getElementById("btnReabrirFotosVisita").classList.remove("visivel");
  painel.classList.toggle("minimizado", window.matchMedia("(max-width: 768px)").matches); // no celular começa fechadinho
  document.getElementById("btnMinPainelFotos").textContent = painel.classList.contains("minimizado") ? "▴" : "▾";
  corpo.innerHTML = '<div class="vazio-pfv">Carregando…</div>';

  const [resp] = await Promise.all([apiListarVisitas(), garantirTokenDownload()]);
  const visita = resp.ok ? (resp.visitas || []).find((v) => v.id === visitaId) : null;
  if (!visita) { corpo.innerHTML = '<div class="vazio-pfv">A visita não foi encontrada (pode ter sido excluída).</div>'; return; }

  fotosPainelVisita = visita.fotos || [];
  document.getElementById("tituloPainelFotos").textContent = `📷 Fotos da visita (${fotosPainelVisita.length})`;
  const quando = visita.dataVisita ? visita.dataVisita.split("-").reverse().join("/") : "";
  corpo.innerHTML = `
    ${fotosPainelVisita.length
      ? `<div class="grade-pfv">${fotosPainelVisita.map((c, i) => `<img src="${urlFotoPainelVisita(c)}" data-i="${i}" alt="Foto ${i + 1}" />`).join("")}</div>`
      : '<div class="vazio-pfv">Essa visita não tem fotos.</div>'}
    <div class="texto-pfv"><b>${escaparHtml(visita.clienteNome)}</b>${quando ? " · visita em " + quando : ""}${visita.descricao ? "\n" + escaparHtml(visita.descricao) : ""}</div>
    ${visita.anotacoes ? `<div class="texto-pfv anot-pfv"><b>📝 Anotações da visita</b> <span style="color:#999">(só interno)</span>\n${escaparHtml(visita.anotacoes)}</div>` : ""}`;
  corpo.querySelectorAll("img[data-i]").forEach((img) => img.addEventListener("click", () => abrirZoomFoto(Number(img.dataset.i))));
}

function esconderPainelFotosVisita() {
  const painel = document.getElementById("painelFotosVisita");
  if (painel) painel.classList.remove("aberto");
  const reabrir = document.getElementById("btnReabrirFotosVisita");
  if (reabrir) reabrir.classList.remove("visivel");
}

