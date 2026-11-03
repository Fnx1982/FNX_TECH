// ============================================================
// auth-worker.js — funções de autenticação e dados compartilhados
// via Cloudflare Worker (usa o mesmo Worker do armazenamento).
// ============================================================

const AUTH_WORKER_URL = FNX_API;

function pegarToken() {
  return localStorage.getItem("sessionToken") || "";
}

async function chamarWorker(action, { method = "GET", body = null, autenticado = true } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (autenticado) {
    const token = pegarToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }
  const res = await fetch(`${AUTH_WORKER_URL}?action=${action}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: false, erro: "Resposta inválida do servidor." }; }
  if (!res.ok && !data.erro) data.erro = "Erro " + res.status;
  return data;
}

// ── Autenticação ─────────────────────────────────────────────
async function apiLogin(registro, senha) {
  return chamarWorker("auth-login", { method: "POST", body: { registro, senha }, autenticado: false });
}

async function apiRegistrar(dados) {
  return chamarWorker("auth-register", { method: "POST", body: dados, autenticado: false });
}

async function apiLogout() {
  await chamarWorker("auth-logout", { method: "POST" });
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("userType");
  localStorage.removeItem("userId");
  localStorage.removeItem("userNome");
  localStorage.removeItem("userSetor");
  localStorage.removeItem("userFotoPerfil"); // foto de perfil não fica pra próxima pessoa
}

async function apiVerificarSessao() {
  return chamarWorker("auth-session-check");
}

// ── Recuperação de senha ────────────────────────────────────
async function apiSolicitarReset(registro) {
  return chamarWorker("reset-request", { method: "POST", body: { registro }, autenticado: false });
}

async function apiTrocarSenhaPrimeiroAcesso(novaSenha) {
  return chamarWorker("trocar-senha-primeiro-acesso", { method: "POST", body: { novaSenha } });
}

async function apiListarResetsPendentes() {
  return chamarWorker("reset-list");
}

async function apiAprovarReset(token, novaSenha) {
  return chamarWorker("reset-approve", { method: "POST", body: { token, novaSenha } });
}

async function apiDescartarReset(token) {
  return chamarWorker("reset-dismiss", { method: "POST", body: { token } });
}

// ── Usuários (admin) ─────────────────────────────────────────
async function apiListarUsuarios() {
  return chamarWorker("users-list");
}

// Versão sem restrição de admin — qualquer usuário logado pode ver a
// lista de colegas (nome/registro/setor), usada em telas como Pontos
// e Relatórios. Não serve para editar/excluir cadastros.
async function apiListarUsuariosBasico() {
  return chamarWorker("users-list-basic");
}

async function apiSalvarUsuario(dados) {
  return chamarWorker("users-save", { method: "POST", body: dados });
}

async function apiExcluirUsuario(registro) {
  return chamarWorker("users-delete", { method: "POST", body: { registro } });
}

// ── Dados compartilhados (setores, permissões) ────────────────
async function apiDataGet(key) {
  const r = await chamarWorker(`data-get&key=${encodeURIComponent(key)}`);
  return r;
}

async function apiDataSet(key, valor) {
  return chamarWorker("data-set", { method: "POST", body: { key, valor } });
}

// ── Salas de reunião fixas ────────────────────────────────────
// Lista filtrada — só as salas que o usuário logado pode acessar.
async function apiListarSalasReuniao() {
  return chamarWorker("salas-list");
}

// ── Notas recebidas (documentos de fornecedores para nosso CNPJ) ──
async function apiListarRecebidos() {
  return chamarWorker("recebidos-list");
}

async function apiSalvarRecebido(dados) {
  return chamarWorker("recebidos-salvar", { method: "POST", body: dados });
}

async function apiExcluirRecebido(id) {
  return chamarWorker("recebidos-excluir", { method: "POST", body: { id } });
}

// ── Lixeira de Recebidos (unificada com a lixeira do Armazenamento) ──
async function apiListarLixeiraRecebidos() {
  return chamarWorker("recebidos-lixeira-list");
}
async function apiRestaurarRecebido(id) {
  return chamarWorker("recebidos-restaurar", { method: "POST", body: { id } });
}
async function apiExcluirRecebidoDefinitivo(id) {
  return chamarWorker("recebidos-excluir-definitivo", { method: "POST", body: { id } });
}

// ── Demandas (tarefas dentro de uma obra) ────────────────────────
async function apiListarDemandas(obraId) {
  return chamarWorker("demandas-list" + (obraId ? `&obraId=${encodeURIComponent(obraId)}` : ""));
}
async function apiSalvarDemanda(dados) {
  return chamarWorker("demandas-salvar", { method: "POST", body: dados });
}
async function apiConcluirDemanda(id, fotoConclusaoChave, observacaoConclusao) {
  return chamarWorker("demandas-concluir", { method: "POST", body: { id, fotoConclusaoChave, observacaoConclusao } });
}
async function apiExcluirDemanda(id) {
  return chamarWorker("demandas-excluir", { method: "POST", body: { id } });
}

// ── Notificações ──────────────────────────────────────────────
async function apiListarNotificacoes() {
  return chamarWorker("notificacoes-list");
}
async function apiMarcarNotificacaoLida(id) {
  return chamarWorker("notificacoes-marcar-lida", { method: "POST", body: { id } });
}
async function apiExcluirNotificacao(id) {
  return chamarWorker("notificacoes-excluir", { method: "POST", body: { id } });
}
async function apiMarcarTodasNotificacoesLidas() {
  return chamarWorker("notificacoes-marcar-todas-lidas", { method: "POST", body: {} });
}

// ── Visita Técnica ────────────────────────────────────────────
async function apiListarVisitas() {
  return chamarWorker("visitas-list");
}
async function apiSalvarVisita(dados) {
  return chamarWorker("visitas-salvar", { method: "POST", body: dados });
}
async function apiExcluirVisita(id) {
  return chamarWorker("visitas-excluir", { method: "POST", body: { id } });
}

// ── Notas fiscais (NF-e / NFS-e) ────────────────────────────────
async function apiListarNotasFiscais() {
  return chamarWorker("notas-fiscais-list");
}

async function apiSalvarNotaFiscal(dados) {
  return chamarWorker("notas-fiscais-salvar", { method: "POST", body: dados });
}

async function apiExcluirNotaFiscal(id) {
  return chamarWorker("notas-fiscais-excluir", { method: "POST", body: { id } });
}

async function apiEmitirNotaFiscal(id) {
  return chamarWorker("notas-fiscais-emitir", { method: "POST", body: { id } });
}

async function apiCancelarNotaFiscal(id, motivo) {
  return chamarWorker("notas-fiscais-cancelar", { method: "POST", body: { id, motivo } });
}

// ── Contatos (clientes/fornecedores) ────────────────────────────
async function apiListarContatos() {
  return chamarWorker("contatos-list");
}
async function apiSalvarContato(dados) {
  return chamarWorker("contatos-salvar", { method: "POST", body: dados });
}
async function apiExcluirContato(id) {
  return chamarWorker("contatos-excluir", { method: "POST", body: { id } });
}

// ── Materiais (catálogo de produtos, com NCM/CFOP) ───────────────
async function apiListarMateriais() {
  return chamarWorker("materiais-list");
}
async function apiSalvarMaterial(dados) {
  return chamarWorker("materiais-salvar", { method: "POST", body: dados });
}
async function apiExcluirMaterial(id) {
  return chamarWorker("materiais-excluir", { method: "POST", body: { id } });
}

// ── Serviços / Mão de Obra (catálogo paralelo, para NFS-e) ───────
async function apiListarServicos() {
  return chamarWorker("servicos-list");
}
async function apiSalvarServico(dados) {
  return chamarWorker("servicos-salvar", { method: "POST", body: dados });
}
async function apiExcluirServico(id) {
  return chamarWorker("servicos-excluir", { method: "POST", body: { id } });
}

// ── Vínculo automático entre catálogos e onde os itens são usados ──
// Usado por propostas, NF-e e NFS-e: sempre que um item NOVO (nome
// que ainda não existe no catálogo) é digitado em qualquer uma
// dessas telas, ele é automaticamente cadastrado no catálogo certo
// (Gestão de Material ou Serviços), pra aparecer depois em todas as
// outras telas também — sem precisar cadastrar a mesma coisa de novo
// em lugares diferentes.
async function garantirMaterialNoCatalogo(nome, valor) {
  nome = (nome || "").trim();
  if (!nome) return null;
  const resposta = await apiListarMateriais();
  if (!resposta.ok) return null;
  const existente = resposta.materiais.find((m) => m.nome.trim().toLowerCase() === nome.toLowerCase());
  if (existente) return existente.id;

  const criado = await apiSalvarMaterial({ nome, valor: valor || 0 });
  return criado.ok ? criado.id : null;
}

async function garantirServicoNoCatalogo(nome, valor) {
  nome = (nome || "").trim();
  if (!nome) return null;
  const resposta = await apiListarServicos();
  if (!resposta.ok) return null;
  const existente = resposta.servicos.find((s) => s.nome.trim().toLowerCase() === nome.toLowerCase());
  if (existente) return existente.id;

  const criado = await apiSalvarServico({ nome, valor: valor || 0 });
  return criado.ok ? criado.id : null;
}

// ── Rascunhos de Proposta (auto-save de Orçamento) ───────────────
async function apiListarRascunhosProposta() {
  return chamarWorker("propostas-rascunho-list");
}
async function apiSalvarRascunhoProposta(id, dados) {
  return chamarWorker("propostas-rascunho-salvar", { method: "POST", body: { id, dados } });
}
async function apiExcluirRascunhoProposta(id) {
  return chamarWorker("propostas-rascunho-excluir", { method: "POST", body: { id } });
}

// Versão usada especificamente ao sair da tela/aba (troca de aba ou
// fechamento). Usa fetch com keepalive: true, que instrui o navegador
// a terminar de enviar a requisição mesmo depois da página começar a
// ser descarregada — sem isso, um fetch normal pode ser cancelado no
// meio do caminho justamente no momento em que mais precisamos que
// ele complete.
function apiSalvarRascunhoPropostaImediato(id, dados) {
  const token = pegarToken();
  try {
    fetch(`${AUTH_WORKER_URL}?action=propostas-rascunho-salvar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ id, dados }),
      keepalive: true,
    });
  } catch (e) {
    // Sem tratamento de resposta aqui de propósito — a página já está
    // saindo, não há mais UI pra mostrar erro.
  }
}

// ── Rascunhos genéricos (auto-save de Visita Técnica, Materiais,
// Serviços e Contatos) — mesmo mecanismo do rascunho de proposta
// acima, parametrizado por "tipo": "visita" | "material" | "servico" | "contato".
async function apiListarRascunhos(tipo) {
  return chamarWorker(`rascunho-list&tipo=${encodeURIComponent(tipo)}`);
}
async function apiSalvarRascunho(tipo, id, dados) {
  return chamarWorker("rascunho-salvar", { method: "POST", body: { tipo, id, dados } });
}
async function apiExcluirRascunho(tipo, id) {
  return chamarWorker("rascunho-excluir", { method: "POST", body: { tipo, id } });
}
function apiSalvarRascunhoImediato(tipo, id, dados) {
  const token = pegarToken();
  try {
    fetch(`${AUTH_WORKER_URL}?action=rascunho-salvar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ tipo, id, dados }),
      keepalive: true,
    });
  } catch (e) {
    // Idem: página saindo, sem UI pra mostrar erro.
  }
}

// ── Obras ──────────────────────────────────────────────────────
async function apiListarObras() {
  return chamarWorker("obras-list");
}
async function apiSalvarObra(obra) {
  return chamarWorker("obras-salvar", { method: "POST", body: obra });
}
async function apiExcluirObra(id) {
  return chamarWorker("obras-excluir", { method: "POST", body: { id } });
}
async function apiRestaurarObra(id) {
  return chamarWorker("obras-restaurar", { method: "POST", body: { id } });
}
async function apiExcluirObraDefinitivo(id) {
  return chamarWorker("obras-excluir-definitivo", { method: "POST", body: { id } });
}

// ── Pontos (batidas, lançamentos, jornada, feriados) ─────────────
async function apiPontosRegistrar(lat, lng) {
  return chamarWorker("pontos-registrar", { method: "POST", body: { lat, lng } });
}
async function apiPontosListarBatidas() {
  return chamarWorker("pontos-batidas-list");
}
async function apiPontosSalvarBatida(dados) {
  return chamarWorker("pontos-batida-salvar", { method: "POST", body: dados });
}
async function apiPontosExcluirBatida(id) {
  return chamarWorker("pontos-batida-excluir", { method: "POST", body: { id } });
}
async function apiPontosListarLancamentos() {
  return chamarWorker("pontos-lancamentos-list");
}
async function apiPontosSalvarLancamento(dados) {
  return chamarWorker("pontos-lancamento-salvar", { method: "POST", body: dados });
}
async function apiPontosExcluirLancamento(id) {
  return chamarWorker("pontos-lancamento-excluir", { method: "POST", body: { id } });
}
async function apiPontosListarJornadas() {
  return chamarWorker("pontos-jornadas-list");
}
async function apiPontosSalvarJornada(dados) {
  return chamarWorker("pontos-jornada-salvar", { method: "POST", body: dados });
}
async function apiPontosListarFeriadosFuncionario() {
  return chamarWorker("pontos-feriados-func-list");
}
async function apiPontosSalvarFeriadosFuncionario(registro, lista) {
  return chamarWorker("pontos-feriados-func-salvar", { method: "POST", body: { registro, lista } });
}

// ── Apresentações (PDF de proposta comercial gerado pelo site) ──
async function apiListarApresentacoes() {
  return chamarWorker("apresentacoes-list");
}
async function apiSalvarApresentacao(dados) {
  return chamarWorker("apresentacoes-salvar", { method: "POST", body: dados });
}
async function apiExcluirApresentacao(id) {
  return chamarWorker("apresentacoes-excluir", { method: "POST", body: { id } });
}

// ── CRM de Clientes (quadro Kanban) ──
async function apiListarColunasCrm() {
  return chamarWorker("crm-colunas-list");
}
async function apiSalvarColunasCrm(colunas) {
  return chamarWorker("crm-colunas-salvar", { method: "POST", body: { colunas } });
}
async function apiListarClientesCrm() {
  return chamarWorker("crm-clientes-list");
}
async function apiSalvarClienteCrm(dados) {
  return chamarWorker("crm-clientes-salvar", { method: "POST", body: dados });
}
async function apiExcluirClienteCrm(id) {
  return chamarWorker("crm-clientes-excluir", { method: "POST", body: { id } });
}

// ── Numeração automática (Orçamento, Apresentação — compartilhada) ──
// Cada "tipo" tem seu próprio contador (ex: "orcamento", "apresentacao").
// Pega o próximo número da sequência e já incrementa pro próximo uso.
// Quem incrementa é o servidor (rota própria): antes o site gravava o
// contador com "data-set", que só administrador pode usar — pra quem
// não era administrador o número nunca avançava e todo orçamento novo
// saía com o MESMO número.
async function proximoNumeroSequencial(tipo) {
  const r = await chamarWorker("numeracao-proximo", { method: "POST", body: { tipo } });
  if (r.ok && r.numero) return r.numero;
  throw new Error(r.erro || "Sem numeração");
}
async function verNumeracaoAtual(tipo) {
  const resp = await apiDataGet("contadorNumeracao");
  const contadores = (resp.ok && resp.valor) ? resp.valor : {};
  return contadores[tipo] || 1;
}
async function definirNumeracaoAtual(tipo, novoValor) {
  const resp = await apiDataGet("contadorNumeracao");
  const contadores = (resp.ok && resp.valor) ? resp.valor : {};
  contadores[tipo] = novoValor;
  return apiDataSet("contadorNumeracao", contadores);
}

// Modal pequeno pra configurar a numeração automática — reaproveitado
// no Orçamento e na Apresentação (cada um com seu "tipo"). Constrói a
// si mesmo na primeira vez que é usado, não precisa estar no HTML da
// página.
async function abrirModalConfigNumeracao(tipo, rotulo, aoSalvar) {
  let modal = document.getElementById("modalConfigNumeracao");
  if (!modal) {
    const estilo = document.createElement("style");
    estilo.textContent = `
      #modalConfigNumeracao { position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,.45); display: none;
        align-items: center; justify-content: center; padding: 16px; font-family: 'Montserrat', sans-serif; }
      #modalConfigNumeracao.active { display: flex; }
      #modalConfigNumeracao .cx-num { background: #fff; width: 100%; max-width: 420px; border-radius: 16px; overflow: hidden;
        box-shadow: 0 16px 50px rgba(0,0,0,.3); }
      #modalConfigNumeracao .topo-num { background: #262626; color: #fff; padding: 16px 18px; border-bottom: 5px solid #FF6A00;
        display: flex; justify-content: space-between; align-items: center; }
      #modalConfigNumeracao .topo-num h2 { margin: 0; font-size: 16px; }
      #modalConfigNumeracao .topo-num small { display: block; color: #FFB27A; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
      #modalConfigNumeracao .topo-num button { background: none; border: none; color: #fff; font-size: 26px; cursor: pointer; line-height: 1; }
      #modalConfigNumeracao .corpo-num { padding: 20px 18px 18px; text-align: center; }
      #modalConfigNumeracao .rot-num { font-size: 13px; color: #555; margin-bottom: 10px; }
      #modalConfigNumeracao .controle-num { display: flex; align-items: center; justify-content: center; gap: 10px; }
      #modalConfigNumeracao .controle-num button { width: 44px; height: 44px; border-radius: 50%; border: 1px solid #ddd; background: #f6f6f6;
        font-size: 22px; font-weight: 700; color: #333; cursor: pointer; }
      #modalConfigNumeracao .controle-num button:hover { background: #FFF1E6; border-color: #FF6A00; }
      #modalConfigNumeracao .controle-num input { width: 140px; text-align: center; font-size: 34px; font-weight: 800; color: #222;
        border: 2px solid #FF6A00; border-radius: 12px; padding: 6px 4px; font-family: inherit; }
      #modalConfigNumeracao .previa-num { margin-top: 14px; font-size: 12.5px; color: #777; }
      #modalConfigNumeracao .previa-num span { display: inline-block; background: #FFF1E6; color: #B34700; font-weight: 700; border-radius: 12px;
        padding: 2px 10px; margin: 2px; }
      #modalConfigNumeracao .aviso-num { margin-top: 12px; font-size: 11.5px; color: #999; line-height: 1.4; }
      #modalConfigNumeracao .rodape-num { display: flex; gap: 10px; padding: 0 18px 18px; }
      #modalConfigNumeracao .rodape-num button { flex: 1; padding: 12px; border-radius: 24px; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; }
      #modalConfigNumeracao .btn-cancelar-num { background: #fff; border: 1px solid #ccc; color: #444; }
      #modalConfigNumeracao .btn-salvar-num { background: #FF6A00; border: none; color: #fff; }
    `;
    document.head.appendChild(estilo);
    modal = document.createElement("div");
    modal.id = "modalConfigNumeracao";
    modal.innerHTML = `
      <form class="cx-num" id="formConfigNumeracao">
        <div class="topo-num">
          <div><small>Numeração automática</small><h2 id="tituloModalConfigNumeracao">Configurar numeração</h2></div>
          <button type="button" id="fecharModalConfigNumeracao" aria-label="Fechar">&times;</button>
        </div>
        <div class="corpo-num">
          <div class="rot-num" id="labelConfigNumeracao">Próximo número a ser usado</div>
          <div class="controle-num">
            <button type="button" id="menosNumeracao" aria-label="Diminuir">−</button>
            <input type="number" id="campoValorConfigNumeracao" min="1" step="1" inputmode="numeric" />
            <button type="button" id="maisNumeracao" aria-label="Aumentar">+</button>
          </div>
          <div class="previa-num" id="previaNumeracao"></div>
          <div class="aviso-num">Use isso para continuar a sequência que você já tinha (por exemplo, a do sistema antigo). Os números já usados não mudam.</div>
        </div>
        <div class="rodape-num">
          <button type="button" class="btn-cancelar-num" id="cancelarConfigNumeracao">Cancelar</button>
          <button type="submit" class="btn-salvar-num">Salvar</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);
    const fechar = () => modal.classList.remove("active");
    document.getElementById("fecharModalConfigNumeracao").addEventListener("click", fechar);
    document.getElementById("cancelarConfigNumeracao").addEventListener("click", fechar);
    modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    const campo = document.getElementById("campoValorConfigNumeracao");
    const previa = () => {
      const v = parseInt(campo.value, 10);
      document.getElementById("previaNumeracao").innerHTML = isNaN(v) || v < 1 ? "Digite um número a partir de 1."
        : `Os próximos vão sair: <span>${v}</span><span>${v + 1}</span><span>${v + 2}</span>…`;
    };
    campo.addEventListener("input", previa);
    document.getElementById("menosNumeracao").addEventListener("click", () => { campo.value = Math.max(1, (parseInt(campo.value, 10) || 1) - 1); previa(); });
    document.getElementById("maisNumeracao").addEventListener("click", () => { campo.value = (parseInt(campo.value, 10) || 0) + 1; previa(); });
    modal._previa = previa;
  }

  document.getElementById("tituloModalConfigNumeracao").textContent = rotulo;
  document.getElementById("labelConfigNumeracao").textContent = `Próximo número de ${rotulo.toLowerCase()} a ser usado`;
  document.getElementById("campoValorConfigNumeracao").value = await verNumeracaoAtual(tipo);
  modal._previa();
  modal.classList.add("active");

  const form = document.getElementById("formConfigNumeracao");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const valor = parseInt(document.getElementById("campoValorConfigNumeracao").value, 10);
    if (isNaN(valor) || valor < 1) return;
    const r = await definirNumeracaoAtual(tipo, valor);
    if (!r || !r.ok) { mostrarToast((r && r.erro) || "Não foi possível salvar a numeração.", "erro"); return; }
    mostrarToast("Numeração atualizada.");
    modal.classList.remove("active");
    if (aoSalvar) aoSalvar(valor);
  };
}

// ── Boletos ──
async function apiListarBoletos() {
  return chamarWorker("boletos-list");
}
async function apiSalvarBoleto(dados) {
  return chamarWorker("boletos-salvar", { method: "POST", body: dados });
}
async function apiExcluirBoleto(id) {
  return chamarWorker("boletos-excluir", { method: "POST", body: { id } });
}

// ── Extrato bancário ──
async function apiListarLancamentosExtrato() {
  return chamarWorker("extrato-lancamentos-list");
}
async function apiSalvarLancamentoExtrato(dados) {
  return chamarWorker("extrato-lancamentos-salvar", { method: "POST", body: dados });
}
async function apiExcluirLancamentoExtrato(id) {
  return chamarWorker("extrato-lancamentos-excluir", { method: "POST", body: { id } });
}

// ── Token de download curto (10min) — usado em URLs de <img>/<a>
// pra nunca expor o token de sessão de 12h ali. Gerado uma vez por
// carregamento de página e reaproveitado (evita gerar um novo pra
// cada foto/arquivo mostrado); se expirar no meio de uma sessão
// longa, basta recarregar a página.
let _tokenDownloadCache = null; // { token, exp }

async function garantirTokenDownload() {
  if (_tokenDownloadCache && _tokenDownloadCache.exp > Date.now() + 5000) {
    return _tokenDownloadCache.token;
  }
  const resposta = await chamarWorker("gerar-token-download", { method: "POST" });
  if (!resposta.ok) return "";
  _tokenDownloadCache = { token: resposta.token, exp: Date.now() + 10 * 60 * 1000 };
  return _tokenDownloadCache.token;
}

// Versão síncrona, pra usar dentro de urlFoto()/urlArquivo() — exige
// que garantirTokenDownload() já tenha sido chamado (com await) antes,
// no carregamento da página.
function pegarTokenDownloadCache() {
  return _tokenDownloadCache ? _tokenDownloadCache.token : "";
}

// ============================================================
// SEGURANÇA: escapar texto antes de inserir em innerHTML
// ============================================================
// Qualquer texto que veio de um campo digitado pelo usuário (nome,
// descrição, observação, endereço, etc.) PRECISA passar por aqui
// antes de entrar num template `${...}` que vai virar innerHTML.
// Sem isso, alguém pode digitar algo como
// "<img src=x onerror='roubaSessao()'>" num campo de nome, e esse
// código executa de verdade na tela de quem for ver aquele registro
// depois — inclusive podendo roubar o token de sessão da pessoa
// (guardado no localStorage) e agir como se fosse ela.
function escaparHtml(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ====================================================
// FINANCEIRO DE FUNCIONÁRIOS NA NUVEM
// (tela Funcionários + funcionários lançados dentro das Obras)
// Antes: localStorage "obrasFinanceiro" e "financeiro" (só no navegador).
// Na primeira vez, se a nuvem estiver vazia e este navegador tiver
// dados, eles sobem automaticamente.
// ====================================================
let financeiroFuncCache = (() => {
  try {
    return JSON.parse(localStorage.getItem("financeiro_func_copia_nuvem")) || {
      obras: JSON.parse(localStorage.getItem("obrasFinanceiro")) || [],
      funcionarios: JSON.parse(localStorage.getItem("financeiro")) || [],
    };
  } catch (e) { return { obras: [], funcionarios: [] }; }
})();

async function carregarFinanceiroFunc() {
  const r = await chamarWorker("financeiro-func-get");
  if (!r.ok) return financeiroFuncCache; // sem conexão: usa a cópia local
  if (r.dados) {
    financeiroFuncCache = { obras: r.dados.obras || [], funcionarios: r.dados.funcionarios || [] };
  } else {
    // Nuvem vazia: migra o que este navegador tinha
    let obras = [], funcionarios = [];
    try {
      obras = JSON.parse(localStorage.getItem("obrasFinanceiro")) || [];
      funcionarios = JSON.parse(localStorage.getItem("financeiro")) || [];
    } catch (e) { /* nada */ }
    financeiroFuncCache = { obras, funcionarios };
    if (obras.length || funcionarios.length) {
      const s = await chamarWorker("financeiro-func-salvar", { method: "POST", body: financeiroFuncCache });
      if (s.ok) console.info(`[financeiro] ${funcionarios.length} pagamento(s) deste navegador enviados para a nuvem.`);
    }
  }
  try { localStorage.setItem("financeiro_func_copia_nuvem", JSON.stringify(financeiroFuncCache)); } catch (e) { /* ok */ }
  return financeiroFuncCache;
}

async function salvarFinanceiroFunc(dados) {
  financeiroFuncCache = { obras: dados.obras || [], funcionarios: dados.funcionarios || [] };
  try { localStorage.setItem("financeiro_func_copia_nuvem", JSON.stringify(financeiroFuncCache)); } catch (e) { /* ok */ }
  const r = await chamarWorker("financeiro-func-salvar", { method: "POST", body: financeiroFuncCache });
  if (!r.ok && typeof mostrarToast === "function") mostrarToast("Não foi possível salvar na nuvem agora. Confira a internet.", "erro");
  return r.ok;
}

