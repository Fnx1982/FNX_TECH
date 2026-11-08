// ============================================================
// visita-para-orcamento.js — monta os dados de um orçamento novo a
// partir de uma visita técnica. Usado na Visita Técnica e no Orçamento
// ("Visitas aguardando orçamento"), pra os dois saírem iguais:
//   Endereço  ← endereço, bairro e cidade da visita
//   Local     ← "Local / bloco / referência" da visita
//   Serviço   ← descritivo da visita (vai pro cliente)
//   Dados da visita (interno) ← só as medidas
//                               (só no PDF interno, nunca no do cliente)
//   Observação ← vazia (só o que a pessoa escrever pro cliente)
// ============================================================
function vpoNumero(texto) {
  let t = String(texto || "").trim().replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
function vpoFmt(n) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function textoMedidasDaVisita(medidas) {
  const totais = {};
  const linhas = (medidas || []).filter((m) => (m.descricao || "").trim() || m.m1).map((m) => {
    const qtd = vpoNumero(m.qtd) || 1;
    const sufQtd = qtd > 1 ? ` (x${vpoFmt(qtd)})` : "";
    let valor, unid, conta;
    if (m.unidade === "m") { valor = vpoNumero(m.m1) * qtd; unid = "m"; conta = `${vpoFmt(vpoNumero(m.m1))} m${sufQtd}`; }
    else if (m.unidade === "un") { valor = vpoNumero(m.qtd) || 0; unid = "un"; conta = ""; }
    else { valor = vpoNumero(m.m1) * vpoNumero(m.m2) * qtd; unid = "m²"; conta = `${vpoFmt(vpoNumero(m.m1))} × ${vpoFmt(vpoNumero(m.m2))} m${sufQtd}`; }
    totais[unid] = (totais[unid] || 0) + valor;
    return `- ${m.descricao || "Medida"}: ${conta ? conta + " = " : ""}${vpoFmt(valor)} ${unid}`;
  });
  if (!linhas.length) return "";
  const total = Object.entries(totais).map(([u, v]) => `${vpoFmt(v)} ${u}`).join(" · ");
  return `MEDIDAS DO LEVANTAMENTO:\n${linhas.join("\n")}\nTotal: ${total}`;
}
// Requisitos levantados: texto para o campo interno da estimativa
const ROTULO_PRIORIDADE = { essencial: "Essencial", importante: "Importante", desejavel: "Desejável" };
function textoRequisitosDaVisita(reqs) {
  const validos = (reqs || []).filter((r) => (r.descricao || "").trim());
  if (!validos.length) return "";
  const horas = validos.reduce((s, r) => s + vpoNumero(r.horas), 0);
  const linhas = validos.map((r) => `- [${ROTULO_PRIORIDADE[r.prioridade] || "Essencial"}] ${r.descricao.trim()}${vpoNumero(r.horas) ? ` (${vpoFmt(vpoNumero(r.horas))} h)` : ""}`);
  return `REQUISITOS LEVANTADOS:\n${linhas.join("\n")}${horas ? `\nTotal estimado: ${vpoFmt(horas)} h` : ""}`;
}
// Cada requisito vira um item de serviço da estimativa (qtd = horas)
function itensDosRequisitos(reqs) {
  const ordem = { essencial: 0, importante: 1, desejavel: 2 };
  return (reqs || []).filter((r) => (r.descricao || "").trim())
    .sort((a, b) => (ordem[a.prioridade] ?? 0) - (ordem[b.prioridade] ?? 0))
    .map((r) => ({
      qtd: vpoNumero(r.horas) || null,
      unid: "H",
      descricao: r.descricao.trim() + (r.prioridade === "desejavel" ? " (opcional)" : ""),
      valorUnit: null, valorFinal: null, servicoId: null, obsCliente: "", obsInterna: "",
    }));
}

function montarOrcamentoDaVisita(v) {
  // Requisitos (e medidas de levantamentos antigos) vão no campo
  // interno; o objetivo vai na "Visão geral"; cada requisito vira item.
  const interno = [textoRequisitosDaVisita(v.requisitos), textoMedidasDaVisita(v.medidas)].filter(Boolean).join("\n\n");
  const itens = itensDosRequisitos(v.requisitos);
  return {
    ...(itens.length ? { itensMaoDeObra: itens } : {}),
    cliente: v.clienteNome || "",
    telefone: v.telefone || "",
    local: [v.endereco, v.bairro, v.cidade].filter(Boolean).join(" - "),
    localDescricao: v.local || "",
    servico: v.descricao || "",
    observacao: "",
    dadosVisitaInterno: interno,
    visitaId: v.id, // mostra as fotos da visita no quadro do canto
  };
}
