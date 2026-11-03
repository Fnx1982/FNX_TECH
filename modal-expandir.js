// ============================================================
// modal-expandir.js — botão ⤢ "Tela cheia" nas janelas do site.
//
// As janelas (Novo orçamento, cadastros, etc.) abrem do tamanho de
// sempre. No computador aparece um botão ⤢ ao lado do X: ele deixa a
// janela em tela cheia; clicando de novo (⤡) volta ao tamanho normal.
// O site lembra a escolha: se deixou expandido, a próxima janela já
// abre expandida.
//
// Só no computador (tela grande com mouse). No celular e no tablet as
// janelas já ocupam a tela, então o botão nem aparece.
// ============================================================
(function () {
  const CHAVE = "modalExpandido";

  const estilo = document.createElement("style");
  estilo.textContent = `
    .btn-expandir-modal {
      display: none;
      background: none;
      border: 1px solid #ccc;
      border-radius: 6px;
      width: 32px;
      height: 32px;
      font-size: 17px;
      line-height: 1;
      color: #555;
      cursor: pointer;
      margin-left: auto;
      margin-right: 10px;
    }
    .btn-expandir-modal:hover { background: #fff; color: #000; border-color: #999; }
    @media (min-width: 1024px) and (hover: hover) {
      .btn-expandir-modal { display: inline-flex; align-items: center; justify-content: center; }
      /* Tela cheia: a janela ocupa a janela inteira do navegador,
         sem bordas nem cantos arredondados */
      .modal-expandida {
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100vh !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        margin: 0 !important;
      }
      .overlay-com-modal-expandida { padding: 0 !important; align-items: stretch !important; justify-content: stretch !important; }
    }
  `;
  document.head.appendChild(estilo);

  function aplicar(caixa, expandir, botao) {
    caixa.classList.toggle("modal-expandida", expandir);
    const fundo = caixa.closest(".modal-overlay");
    if (fundo) fundo.classList.toggle("overlay-com-modal-expandida", expandir);
    botao.textContent = expandir ? "⤡" : "⤢";
    botao.title = expandir ? "Voltar ao tamanho normal" : "Tela cheia";
  }

  function prepararCabecalho(cabecalho) {
    if (cabecalho.dataset.expandirPronto) return;
    const caixa = cabecalho.closest(".modal-caixa, .modal-caixa-grande");
    if (!caixa) return;
    // Janelas pequenas (confirmações, avisos) não precisam do botão
    const larguraMax = parseFloat(getComputedStyle(caixa).maxWidth) || 0;
    if (larguraMax && larguraMax < 500) return;
    cabecalho.dataset.expandirPronto = "1";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn-expandir-modal";
    const fechar = cabecalho.querySelector(".modal-fechar");
    if (fechar) cabecalho.insertBefore(botao, fechar);
    else cabecalho.appendChild(botao);

    aplicar(caixa, localStorage.getItem(CHAVE) === "1", botao);
    botao.addEventListener("click", (e) => {
      e.stopPropagation();
      const expandir = !caixa.classList.contains("modal-expandida");
      localStorage.setItem(CHAVE, expandir ? "1" : "0");
      aplicar(caixa, expandir, botao);
    });
  }

  function procurar() {
    document.querySelectorAll(".modal-cabecalho").forEach(prepararCabecalho);
  }
  procurar();
  // Janelas criadas depois (pelo JavaScript da página) também ganham o botão
  new MutationObserver(procurar).observe(document.body, { childList: true, subtree: true });
})();
