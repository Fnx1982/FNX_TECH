// ============================================================
// pontos-core.js
// Núcleo de dados compartilhado por pontos-confirmacao.js (tela
// do funcionário) e pontos-consulta.js (tela do gestor).
//
// MOTIVO DESTE ARQUIVO EXISTIR DO ZERO: o pontos-core.js anterior
// tinha o conteúdo ERRADO (uma cópia velha de propostas-core.js,
// sem nenhuma função de ponto) — por isso a Consulta não
// funcionava. Este arquivo foi reconstruído lendo com cuidado
// tudo que pontos-consulta.js e pontos-confirmacao.js esperam
// receber daqui.
//
// Batidas, lançamentos, jornadas e feriados agora vivem no
// SERVIDOR (Cloudflare KV), não mais em localStorage — sem isso,
// o gestor nunca conseguiria ver o ponto batido no celular de um
// funcionário. Uso o mesmo padrão de CACHE em memória já usado
// pra Obras: funções de LEITURA continuam síncronas (lêem do
// cache já carregado), funções de ESCRITA são assíncronas e
// conversam com o servidor.
//
// Toda página que usa isso precisa chamar, com await, no início:
//   await carregarDadosPontosCache();
// antes de usar qualquer função de leitura.
//
// ⚠️ ATENÇÃO — BANCO DE HORAS: a fórmula de saldo abaixo
// (calcularBancoHorasCompleto) é uma interpretação razoável do
// que o código anterior sugeria, mas cálculo de banco de horas
// tem nuances trabalhistas reais. CONFIRA os números com casos de
// teste reais antes de usar isso pra decisão de pagamento.
// ============================================================

const NOMES_MESES_PONTO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Tipos de lançamento e o efeito de cada um no banco de horas:
//   credito → soma horas ao saldo (ex: hora extra aprovada)
//   debito  → subtrai horas do saldo (ex: falta não justificada)
//   abono   → NÃO mexe direto no saldo — em vez disso, reduz a
//             quantidade de horas ESPERADAS naquele período (o dia
//             fica "perdoado", não conta contra a pessoa nem a favor)
const TIPOS_LANCAMENTO = {
  hora_extra:     { rotulo: "Hora Extra",       efeito: "credito" },
  // "falta" não soma débito adicional aqui: um dia sem bater ponto
  // já vira déficit sozinho (não some do "horasEsperadas"). Esse
  // lançamento serve pra DOCUMENTAR a falta com um motivo, não pra
  // descontar de novo em cima do que já foi descontado.
  falta:          { rotulo: "Falta",            efeito: "neutro"  },
  abono:          { rotulo: "Abono",            efeito: "abono"   },
  atestado:       { rotulo: "Atestado",         efeito: "abono"   },
  declaracao:     { rotulo: "Declaração",       efeito: "abono"   },
  feriado_manual: { rotulo: "Feriado (manual)", efeito: "abono"   },
  ferias:         { rotulo: "Férias",           efeito: "abono"   },
  ajuste:         { rotulo: "Ajuste Manual",    efeito: "ajuste"  }, // sinal vem do próprio valor de "horas"
  // Zeragem: o saldo volta a 0 no fim do dia escolhido. Tudo até esse
  // dia (batidas, lançamentos, horas esperadas) deixa de contar no
  // saldo — mas NADA é apagado: as batidas continuam no histórico e no
  // PDF. Excluir a zeragem desfaz.
  zeragem:        { rotulo: "Banco zerado",     efeito: "zeragem" },
};

// Data da última zeragem do banco dessa pessoa ("YYYY-MM-DD") ou null
function dataUltimaZeragem(registro) {
  const datas = _lancamentosCache
    .filter((l) => l.registroFuncionario === registro && l.tipo === "zeragem" && l.data)
    .map((l) => l.data)
    .sort();
  return datas.length ? datas[datas.length - 1] : null;
}

// ====================================================
// CACHE EM MEMÓRIA
// ====================================================
let _batidasCache = [];
let _lancamentosCache = [];
let _jornadasCache = {};           // { registro: {horaEntrada, horaSaida, inicioAlmoco, fimAlmoco} }
let _feriadosNacionaisCache = [];  // ["MM-DD", ...]
let _feriadosFuncionarioCache = {}; // { registro: ["YYYY-MM-DD" (só aquele dia) ou "MM-DD" (fixo, todo ano), ...] }
let _feriadosNomesCache = {};       // { "MM-DD": "Nome do feriado" } — nomes dos feriados nacionais

async function carregarDadosPontosCache() {
  const [rBatidas, rLanc, rJorn, rFerNac, rFerFunc, rFerNomes] = await Promise.all([
    apiPontosListarBatidas(),
    apiPontosListarLancamentos(),
    apiPontosListarJornadas(),
    apiDataGet("pontosFeriadosNacionais"),
    apiPontosListarFeriadosFuncionario(),
    apiDataGet("pontosFeriadosNomes").catch(() => ({ ok: false })),
  ]);
  if (rFerNomes && rFerNomes.ok && rFerNomes.valor) _feriadosNomesCache = rFerNomes.valor;
  if (rBatidas.ok) _batidasCache = rBatidas.batidas;
  if (rLanc.ok) _lancamentosCache = rLanc.lancamentos;
  if (rJorn.ok) _jornadasCache = rJorn.jornadas;
  if (rFerNac.ok && rFerNac.valor) _feriadosNacionaisCache = rFerNac.valor;
  if (rFerFunc.ok) _feriadosFuncionarioCache = rFerFunc.feriados;
}

// ====================================================
// LEITURA (síncrona, lê do cache)
// ====================================================
function lerRegistros() {
  return _batidasCache;
}
function getBatidasFuncionarioData(registro, dataISO) {
  return _batidasCache
    .filter((b) => b.registroFuncionario === registro && dataLocalBR(b.dataHora) === dataISO)
    .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));
}

function lerLancamentos() {
  return _lancamentosCache;
}
function getLancamentosFuncionario(registro) {
  return _lancamentosCache
    .filter((l) => l.registroFuncionario === registro)
    .sort((a, b) => new Date(b.data) - new Date(a.data));
}

function lerFeriadosNacionais() {
  return _feriadosNacionaisCache;
}
function lerFeriadosFuncionario(registro) {
  return _feriadosFuncionarioCache[registro] || [];
}
function lerNomesFeriadosNacionais() {
  return _feriadosNomesCache;
}
async function salvarNomesFeriadosNacionais(nomes) {
  _feriadosNomesCache = nomes;
  return apiDataSet("pontosFeriadosNomes", nomes);
}
// Feriado fixo = "MM-DD" (vale todo ano); com ano = só aquele dia
function ehFeriadoFixo(valor) {
  return /^\d{2}-\d{2}$/.test(valor);
}

function calcularHorasDiaJornada(j) {
  if (!j || !j.horaEntrada || !j.horaSaida) return 0;
  const [he, me] = j.horaEntrada.split(":").map(Number);
  const [hs, ms] = j.horaSaida.split(":").map(Number);
  let totalMin = (hs * 60 + ms) - (he * 60 + me);
  if (j.inicioAlmoco && j.fimAlmoco) {
    const [ha1, ma1] = j.inicioAlmoco.split(":").map(Number);
    const [ha2, ma2] = j.fimAlmoco.split(":").map(Number);
    const almoco = (ha2 * 60 + ma2) - (ha1 * 60 + ma1);
    if (almoco > 0) totalMin -= almoco;
  }
  return totalMin > 0 ? totalMin / 60 : 0;
}

// Retorna o objeto completo da jornada (entrada, saída, almoço, horasDia).
// Se o funcionário ainda não tem jornada configurada, devolve um
// objeto vazio com horasDia: 0 — não inventa um padrão de 8h sozinho,
// porque isso mascararia "ninguém configurou a jornada dessa pessoa
// ainda" como se fosse um dado real.
function getJornadaCompleta(registro) {
  const j = _jornadasCache[registro];
  if (!j) return { horaEntrada: "", horaSaida: "", inicioAlmoco: "", fimAlmoco: "", horasDia: 0 };
  return { ...j, horasDia: calcularHorasDiaJornada(j) };
}
// Versão curta, só o número de horas/dia (usada nos cálculos de saldo).
function getJornadaFuncionario(registro) {
  return getJornadaCompleta(registro).horasDia;
}

// ====================================================
// DIAS ÚTEIS / FERIADOS
// ====================================================

// O servidor (Cloudflare Worker) roda em UTC, não no horário do
// Brasil — então "agora" calculado ingenuamente (toISOString().slice(0,10))
// fica ERRADO sempre que já passou das 21h no Brasil (porque em UTC
// já virou o dia seguinte). Esta função converte um instante
// qualquer pra "que dia é isso, no relógio do Brasil". Brasil não
// tem mais horário de verão desde 2019, então UTC-3 fixo é seguro.
function dataLocalBR(dataHoraOuISO) {
  const instante = dataHoraOuISO ? new Date(dataHoraOuISO) : new Date();
  const deslocado = new Date(instante.getTime() - 3 * 60 * 60 * 1000);
  return deslocado.toISOString().slice(0, 10);
}

function ehFimDeSemana(dataISO) {
  const dia = new Date(dataISO + "T12:00:00").getDay();
  return dia === 0 || dia === 6;
}
function ehFeriado(dataISO, registro) {
  const mmdd = dataISO.slice(5, 10);
  if (_feriadosNacionaisCache.includes(mmdd)) return true;
  if (registro) {
    const doFunc = lerFeriadosFuncionario(registro);
    if (doFunc.includes(dataISO) || doFunc.includes(mmdd)) return true; // data exata ou fixo (todo ano)
  }
  return false;
}
function ehDiaUtil(dataISO, registro) {
  return !ehFimDeSemana(dataISO) && !ehFeriado(dataISO, registro);
}

// Devolve a LISTA de datas do mês (não a contagem) — cada uma no
// formato "YYYY-MM-DD", pronta pra ser usada em ehDiaUtil/ehFeriado.
function diasDoMes(mes, ano) {
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const dias = [];
  for (let d = 1; d <= totalDias; d++) {
    dias.push(`${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dias;
}
function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ====================================================
// FORMATAÇÃO
// ====================================================
function formatarHoras(horas) {
  const h = Math.floor(Math.abs(horas));
  const m = Math.round((Math.abs(horas) - h) * 60);
  return `${horas < 0 ? "-" : ""}${h}h${String(m).padStart(2, "0")}min`;
}
function formatarDataBR(dataISO) {
  return new Date(dataISO + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}
function formatarHoraBR(dataHoraISO) {
  return new Date(dataHoraISO).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ====================================================
// CÁLCULO DE HORAS TRABALHADAS
// ====================================================
// Soma os intervalos entrada→saída de um dia. Uma "entrada" sem
// "saída" correspondente (esqueceu de bater, ou é hoje e ainda
// está trabalhando) não conta horas — fica pendente até a saída
// ser batida.
function calcularHorasTrabalhadasNoDia(batidasDia) {
  let totalMs = 0;
  let entradaAberta = null;
  batidasDia.forEach((b) => {
    if (b.tipo === "entrada") {
      entradaAberta = new Date(b.dataHora);
    } else if (b.tipo === "saida" && entradaAberta) {
      totalMs += new Date(b.dataHora) - entradaAberta;
      entradaAberta = null;
    }
  });
  return totalMs / 3600000;
}

// ====================================================
// BANCO DE HORAS (saldo acumulado) — ver aviso no topo do arquivo
// ====================================================
// "ateISO" (opcional): calcula o saldo como se hoje fosse esse dia
// (usado pra mostrar quanto vai ser zerado numa data passada).
function calcularBancoHorasCompleto(registro, ateISO) {
  const jornada = getJornadaFuncionario(registro);
  // Banco zerado: só conta o que vem DEPOIS do dia da zeragem
  const corte = dataUltimaZeragem(registro);
  const corteFinal = corte && ateISO && corte >= ateISO ? null : corte;
  const registros = _batidasCache.filter((b) => b.registroFuncionario === registro &&
    (!corteFinal || dataLocalBR(b.dataHora) > corteFinal) && (!ateISO || dataLocalBR(b.dataHora) <= ateISO));
  const diasComBatida = [...new Set(registros.map((r) => dataLocalBR(r.dataHora)))];

  let horasTrabalhadas = 0;
  diasComBatida.forEach((dia) => {
    const batidasDia = registros.filter((r) => dataLocalBR(r.dataHora) === dia).sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));
    horasTrabalhadas += calcularHorasTrabalhadasNoDia(batidasDia);
  });

  // Horas esperadas: jornada × dias úteis, contados desde o
  // primeiro registro de ponto dessa pessoa até hoje (não temos uma
  // "data de admissão" separada — o primeiro ponto batido é o
  // proxy mais confiável disponível).
  let horasEsperadas = 0;
  if (diasComBatida.length > 0 || corteFinal) {
    // Depois de uma zeragem, a conta recomeça no dia seguinte a ela
    let primeiraData = diasComBatida.length ? [...diasComBatida].sort()[0] : null;
    if (corteFinal) {
      const diaSeguinte = new Date(corteFinal + "T12:00:00");
      diaSeguinte.setDate(diaSeguinte.getDate() + 1);
      primeiraData = diaSeguinte.toISOString().slice(0, 10);
    }
    const cur = new Date(primeiraData + "T12:00:00");
    const hoje = ateISO ? new Date(ateISO + "T12:00:00") : new Date();
    hoje.setHours(12, 0, 0, 0);
    while (cur <= hoje) {
      const iso = cur.toISOString().slice(0, 10);
      if (ehDiaUtil(iso, registro)) horasEsperadas += jornada;
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Lançamentos ajustam o saldo de formas diferentes conforme o tipo:
  let creditoLancamentos = 0;  // soma direto no saldo (hora extra, ajuste positivo)
  let debitoLancamentos = 0;   // subtrai direto do saldo (falta, ajuste negativo)
  let horasAbonadas = 0;       // reduz o quanto era ESPERADO (abono/atestado/férias/feriado manual)

  getLancamentosFuncionario(registro).forEach((l) => {
    if (l.tipo === "zeragem") return;
    if (corteFinal && l.data <= corteFinal) return; // antes da zeragem: já foi zerado
    if (ateISO && l.data > ateISO) return;
    const info = TIPOS_LANCAMENTO[l.tipo] || { efeito: "abono" };
    const horasAbs = Math.abs(l.horas || 0);
    if (info.efeito === "credito") creditoLancamentos += horasAbs;
    else if (info.efeito === "debito") debitoLancamentos += horasAbs;
    else if (info.efeito === "abono") horasAbonadas += horasAbs;
    else if (info.efeito === "ajuste") { // "ajuste" usa o sinal real de l.horas
      if ((l.horas || 0) >= 0) creditoLancamentos += horasAbs;
      else debitoLancamentos += horasAbs;
    }
  });

  const horasEsperadasAjustadas = Math.max(0, horasEsperadas - horasAbonadas);
  const saldo = (horasTrabalhadas + creditoLancamentos) - debitoLancamentos - horasEsperadasAjustadas;

  return { jornada, horasTrabalhadas, horasEsperadas: horasEsperadasAjustadas, saldo, diasTrabalhados: diasComBatida.length, zeradoEm: corteFinal };
}

// ====================================================
// APURAÇÃO POR PERÍODO — pra gerar os relatórios "Extrato" (uma
// linha resumo) e "Apuração" (dia a dia), no mesmo formato usado
// pelo Control iD. Diferente de calcularBancoHorasCompleto (que
// olha TODO o histórico da pessoa), esta função é ESCOPADA a um
// período específico (ex: um mês) — é o que dá o número de
// "Banco Total" (saldo só daquele período, bem menor que o
// "Banco Saldo" acumulado desde sempre).
//
// ⚠️ LIMITAÇÃO CONHECIDA: "Falta e Atraso" aqui reflete só os
// lançamentos manuais do tipo "falta" — não existe (ainda) detecção
// automática de atraso comparando o horário real da batida de
// entrada com o horário esperado da jornada. "Dia Falta" é a soma
// em horas dos dias úteis sem batida e sem lançamento de abono
// cobrindo. Confira esses dois números contra o Control iD antes de
// usar num período com faltas/atrasos de verdade.
// ====================================================
function calcularApuracaoPeriodo(registro, dataInicioISO, dataFimISO) {
  const jornada = getJornadaFuncionario(registro);
  const dias = [];
  let cur = new Date(dataInicioISO + "T12:00:00");
  const fim = new Date(dataFimISO + "T12:00:00");
  while (cur <= fim) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const lancamentosPeriodo = getLancamentosFuncionario(registro).filter((l) => l.data >= dataInicioISO && l.data <= dataFimISO);
  const lancamentosPorDia = {};
  lancamentosPeriodo.forEach((l) => { (lancamentosPorDia[l.data] = lancamentosPorDia[l.data] || []).push(l); });

  let totalNormais = 0, extraDiurna = 0, diaFaltaHoras = 0, faltaEAtrasoHoras = 0, abonoHoras = 0;
  const linhasDia = [];

  dias.forEach((dia) => {
    const diaUtil = ehDiaUtil(dia, registro);
    const batidasDia = getBatidasFuncionarioData(registro, dia);
    const horasDia = calcularHorasTrabalhadasNoDia(batidasDia);
    const lancamentosDoDia = lancamentosPorDia[dia] || [];
    const temAbono = lancamentosDoDia.some((l) => (TIPOS_LANCAMENTO[l.tipo] || {}).efeito === "abono");

    lancamentosDoDia.forEach((l) => {
      const info = TIPOS_LANCAMENTO[l.tipo] || {};
      const h = Math.abs(l.horas || 0);
      if (info.efeito === "abono") abonoHoras += h;
      if (l.tipo === "falta") faltaEAtrasoHoras += h; // ver limitação no comentário acima
    });

    if (!diaUtil) {
      // Fim de semana/feriado: qualquer hora trabalhada é extra.
      extraDiurna += horasDia;
    } else if (batidasDia.length > 0) {
      totalNormais += Math.min(horasDia, jornada);
      extraDiurna += Math.max(0, horasDia - jornada);
    } else if (!temAbono) {
      // Dia útil, sem batida, sem abono cobrindo → falta.
      diaFaltaHoras += jornada;
    }

    linhasDia.push({ data: dia, diaUtil, batidas: batidasDia, horasDia, lancamentos: lancamentosDoDia });
  });

  const bancoTotalPeriodo = totalNormais + extraDiurna + abonoHoras
    - (dias.filter((d) => ehDiaUtil(d, registro)).length * jornada);

  return {
    totalNormais, totalNoturno: 0, diaFalta: diaFaltaHoras, faltaEAtraso: faltaEAtrasoHoras,
    abono: abonoHoras, extraDiurna, extraNoturna: 0,
    bancoTotal: bancoTotalPeriodo,
    linhasDia,
  };
}

// ====================================================
// PERMISSÕES — reaproveita o sistema de permissão por setor que
// já existe (permissoes-setor.js), itens "pontos-alterar-outros" e
// "pontos-editar-feriados" já configuráveis no cadastro de setor.
// ====================================================
// CEO e qualquer pessoa do setor "Diretoria" sempre têm essas duas
// permissões, sem precisar estar marcado na lista do setor — mesmo
// critério usado no servidor (função "ehAdministrador" no Worker).
function _ehAdministradorLocal() {
  const tipo = (localStorage.getItem("userType") || "").toLowerCase();
  const setor = localStorage.getItem("userSetor") || "";
  return tipo === "ceo" || (typeof ehSetorAdministradorLocal === "function" ? ehSetorAdministradorLocal(setor) : setor === "Diretoria");
}
function podeAlterarPontosDeOutros() {
  if (_ehAdministradorLocal()) return true;
  const meuSetor = localStorage.getItem("userSetor") || "";
  return getPermissoesDoSetor(meuSetor).includes("pontos-alterar-outros");
}
function podeEditarFeriados() {
  if (_ehAdministradorLocal()) return true;
  const meuSetor = localStorage.getItem("userSetor") || "";
  return getPermissoesDoSetor(meuSetor).includes("pontos-editar-feriados");
}

// ====================================================
// ESCRITA (assíncrona — conversa com o servidor e atualiza o cache)
// ====================================================

// Bater ponto de verdade: captura geolocalização do navegador (se a
// pessoa permitir — sem isso, ainda bate o ponto, só sem endereço),
// manda pro servidor, que decide sozinho se é entrada ou saída.
async function baterPonto(registro, nome) {
  let lat = null, lng = null;
  try {
    const posicao = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocalização não suportada")); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 0 });
    });
    lat = posicao.coords.latitude;
    lng = posicao.coords.longitude;
  } catch (e) {
    // Sem permissão de localização, ou demorou demais — o ponto
    // ainda é batido, só sem endereço.
  }

  const resposta = await apiPontosRegistrar(lat, lng);
  if (resposta.ok) _batidasCache.push(resposta.batida);
  return resposta; // { ok, batida } ou { ok:false, erro } — mesmo padrão do resto do site
}

async function criarBatidaManual(dados) {
  const resposta = await apiPontosSalvarBatida(dados);
  if (resposta.ok) _batidasCache.push(resposta.batida);
  return resposta;
}

async function editarBatida(id, dadosNovos) {
  const existente = _batidasCache.find((b) => b.id === id) || {};
  const resposta = await apiPontosSalvarBatida({ ...existente, ...dadosNovos, id });
  if (resposta.ok) {
    const idx = _batidasCache.findIndex((b) => b.id === id);
    if (idx !== -1) _batidasCache[idx] = resposta.batida;
    else _batidasCache.push(resposta.batida);
  }
  return resposta;
}

async function excluirBatida(id) {
  const resposta = await apiPontosExcluirBatida(id);
  if (resposta.ok) _batidasCache = _batidasCache.filter((b) => b.id !== id);
  return resposta;
}

async function adicionarLancamento(dados) {
  const resposta = await apiPontosSalvarLancamento(dados);
  if (resposta.ok) _lancamentosCache.push(resposta.lancamento);
  return resposta;
}

async function editarLancamento(id, dadosNovos) {
  const existente = _lancamentosCache.find((l) => l.id === id) || {};
  const resposta = await apiPontosSalvarLancamento({ ...existente, ...dadosNovos, id });
  if (resposta.ok) {
    const idx = _lancamentosCache.findIndex((l) => l.id === id);
    if (idx !== -1) _lancamentosCache[idx] = resposta.lancamento;
    else _lancamentosCache.push(resposta.lancamento);
  }
  return resposta;
}

async function excluirLancamento(id) {
  const resposta = await apiPontosExcluirLancamento(id);
  if (resposta.ok) _lancamentosCache = _lancamentosCache.filter((l) => l.id !== id);
  return resposta;
}

// Retorna as horas/dia calculadas, já salvas — o chamador (tela de
// Jornadas) usa isso pra atualizar o número mostrado na hora.
async function setJornadaFuncionario(registro, entrada, saida, almocoInicio, almocoFim) {
  const resposta = await apiPontosSalvarJornada({ registro, horaEntrada: entrada, horaSaida: saida, inicioAlmoco: almocoInicio, fimAlmoco: almocoFim });
  if (resposta.ok) {
    _jornadasCache[registro] = resposta.jornada;
    resposta.horasDia = calcularHorasDiaJornada(resposta.jornada);
  }
  return resposta; // { ok, jornada, horasDia } ou { ok:false, erro }
}

async function salvarFeriadosNacionais(lista) {
  _feriadosNacionaisCache = lista;
  return apiDataSet("pontosFeriadosNacionais", lista);
}
async function salvarFeriadosFuncionario(registro, lista) {
  _feriadosFuncionarioCache[registro] = lista;
  return apiPontosSalvarFeriadosFuncionario(registro, lista);
}