// ============================================================
// apresentacoes-salvas.js
// Lista todas as apresentações (propostas comerciais em PDF) já
// geradas, com botão de baixar, editar e excluir.
// ============================================================

async function carregarListaApresentacoes() {
  const resposta = await apiListarApresentacoes();
  const container = document.getElementById("listaApresentacoesSalvas");
  const semResultados = document.getElementById("semApresentacoes");

  if (!resposta.ok) {
    container.innerHTML = "";
    semResultados.textContent = "Não foi possível carregar as apresentações.";
    semResultados.style.display = "block";
    return;
  }

  const apresentacoes = (resposta.apresentacoes || []).sort((a, b) =>
    new Date(b.atualizadoEm || b.criadoEm || 0) - new Date(a.atualizadoEm || a.criadoEm || 0)
  );

  if (apresentacoes.length === 0) {
    container.innerHTML = "";
    semResultados.textContent = "Nenhuma apresentação foi gerada ainda.";
    semResultados.style.display = "block";
    return;
  }
  semResultados.style.display = "none";

  container.innerHTML = apresentacoes.map((a) => {
    const dataFmt = a.atualizadoEm ? new Date(a.atualizadoEm).toLocaleDateString("pt-BR") : "—";
    const qtdServicos = (a.propostasAnexadas || []).length;
    return `
      <div class="card-apresentacao">
        <div class="card-apresentacao-info">
          <strong>${escaparHtml(a.nomeCliente || "(sem cliente)")} ${a.numeroDocumento ? "— N° " + escaparHtml(a.numeroDocumento) : ""}</strong>
          <span>Atualizada em ${dataFmt} · ${qtdServicos} serviço${qtdServicos === 1 ? "" : "s"}</span>
        </div>
        <div class="card-apresentacao-acoes">
          <button class="btn-baixar-apres" data-baixar="${a.id}">⬇ Baixar</button>
          <button class="btn-editar-apres" data-editar="${a.id}">✎ Editar</button>
          <button class="btn-excluir-apres" data-excluir="${a.id}">🗑 Excluir</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-baixar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `gerar-apresentacao.html?id=${encodeURIComponent(btn.dataset.baixar)}&baixar=1`;
    });
  });
  container.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `gerar-apresentacao.html?id=${encodeURIComponent(btn.dataset.editar)}`;
    });
  });
  container.querySelectorAll("[data-excluir]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Excluir esta apresentação?", "Essa ação não pode ser desfeita.");
      if (!ok) return;
      const resp = await apiExcluirApresentacao(btn.dataset.excluir);
      if (!resp.ok) { mostrarToast(resp.erro || "Erro ao excluir.", "erro"); return; }
      mostrarToast("Apresentação excluída.");
      carregarListaApresentacoes();
    });
  });
}

carregarListaApresentacoes();