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
  return `MEDIDAS DA VISITA:\n${linhas.join("\n")}\nTotal: ${total}`;
}
function montarOrcamentoDaVisita(v) {
  // Só as medidas: o descritivo já vai no "Serviço", e as anotações
  // ficam no quadro de fotos da visita (canto da tela).
  const interno = textoMedidasDaVisita(v.medidas);
  return {
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
