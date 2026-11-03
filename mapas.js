// ============================================================
// mapas.js — transforma endereço em botões "📍 Maps" e "🚗 Waze".
//
// No celular, o link abre direto o aplicativo (Google Maps ou Waze,
// se estiver instalado); no computador abre o Google Maps no navegador.
// Uso: htmlLinksMapa("Rua X, 123, Curitiba") devolve o HTML dos botões.
// ============================================================
(function () {
  const estilo = document.createElement("style");
  estilo.textContent = `
    .links-mapa { display: inline-flex; gap: 6px; flex-wrap: wrap; vertical-align: middle; }
    .links-mapa a {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap;
      padding: 4px 10px; border-radius: 14px; border: 1px solid #e3e3e3; background: #fff; color: #333;
    }
    .links-mapa a:hover { border-color: #FF6A00; color: #B34700; }
    .links-mapa a.waze { color: #0b7fae; }
    .endereco-com-mapa { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .endereco-com-mapa .texto-endereco { font-size: 13px; color: #555; }
  `;
  document.head.appendChild(estilo);

  function limpar(endereco) {
    return String(endereco || "").replace(/\s+/g, " ").trim();
  }

  window.urlGoogleMaps = function (endereco) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(limpar(endereco));
  };
  window.urlWaze = function (endereco) {
    return "https://waze.com/ul?q=" + encodeURIComponent(limpar(endereco)) + "&navigate=yes";
  };

  // Botões prontos (vazio se não tiver endereço)
  window.htmlLinksMapa = function (endereco) {
    const e = limpar(endereco);
    if (e.length < 4) return "";
    return `<span class="links-mapa">
      <a href="${urlGoogleMaps(e)}" target="_blank" rel="noopener" title="Abrir no Google Maps" onclick="event.stopPropagation()">📍 Maps</a>
      <a class="waze" href="${urlWaze(e)}" target="_blank" rel="noopener" title="Abrir no Waze" onclick="event.stopPropagation()">🚗 Waze</a>
    </span>`;
  };

  // Junta pedaços de endereço (ignora os vazios)
  window.juntarEndereco = function (...partes) {
    return partes.map(limpar).filter(Boolean).join(", ");
  };
})();
