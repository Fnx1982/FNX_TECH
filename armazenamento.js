// ============================================================
// armazenamento.js — usa Cloudflare Worker como proxy para R2
// ============================================================

const WORKER_URL   = FNX_API;
const STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB

// ── API via Worker ────────────────────────────────────────────
function headerAuth() {
  const token = localStorage.getItem("sessionToken") || "";
  return token ? { Authorization: "Bearer " + token } : {};
}

async function apiList(prefix) {
  const res = await fetch(`${WORKER_URL}?action=list&prefix=${encodeURIComponent(prefix || "")}`, { headers: headerAuth() });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Sessão expirada. Recarregue a página e faça login novamente.");
    throw new Error("Erro ao listar: " + res.statusText);
  }
  return res.text(); // XML
}

async function apiListAll() {
  const res = await fetch(`${WORKER_URL}?action=listall`, { headers: headerAuth() });
  if (!res.ok) throw new Error("Erro ao listar tudo");
  return res.text();
}

async function apiUpload(key, arquivo, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL}?action=put&key=${encodeURIComponent(key)}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    const token = localStorage.getItem("sessionToken") || "";
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload  = () => { if (xhr.status < 300) resolve(); else reject(new Error(xhr.status === 401 ? "Sessão expirada. Recarregue a página." : xhr.responseText)); };
    xhr.onerror = () => reject(new Error("Falha de conexão"));
    xhr.send(arquivo);
  });
}

async function apiDelete(key) {
  const res = await fetch(`${WORKER_URL}?action=delete&key=${encodeURIComponent(key)}`, { method: "DELETE", headers: headerAuth() });
  if (!res.ok) throw new Error("Erro ao excluir: " + res.statusText);
}

async function apiMove(de, para) {
  const res = await fetch(`${WORKER_URL}?action=move&key=${encodeURIComponent(de)}&dest=${encodeURIComponent(para)}`, { method: "POST", headers: headerAuth() });
  if (!res.ok) throw new Error("Erro ao mover: " + res.statusText);
}

// Move uma PASTA inteira (todo arquivo sob o prefixo "de") para outro
// prefixo — necessário porque pastas não são um objeto único no R2,
// então mover uma exige mover cada arquivo dentro dela.
async function apiMovePrefix(de, para) {
  const res = await fetch(`${WORKER_URL}?action=move-prefix&key=${encodeURIComponent(de)}&dest=${encodeURIComponent(para)}`, { method: "POST", headers: headerAuth() });
  const data = await res.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
  if (!data.ok) throw new Error(data.erro || "Erro ao mover a pasta.");
}

// Exclui uma PASTA inteira (todo arquivo sob o prefixo) definitivamente.
async function apiDeletePrefix(prefix) {
  const res = await fetch(`${WORKER_URL}?action=delete-prefix&key=${encodeURIComponent(prefix)}`, { method: "DELETE", headers: headerAuth() });
  const data = await res.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
  if (!data.ok) throw new Error(data.erro || "Erro ao excluir a pasta.");
}

function apiUrl(key) {
  // Usado em <img src>, <a href download>, <embed>, <video> — essas tags
  // não conseguem enviar o header Authorization, então usa um token de
  // DOWNLOAD de vida curta (10min), nunca o token de sessão de 12h —
  // ver garantirTokenDownload() em auth-worker.js.
  const token = pegarTokenDownloadCache();
  return `${WORKER_URL}?action=get&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
}

// ── Parse XML do R2 ──────────────────────────────────────────
function parseListXml(xml, prefix) {
  const itens = [];
  prefix = prefix || "";

  // Pastas (CommonPrefixes)
  const prefixRe = /<CommonPrefixes><Prefix>(.*?)<\/Prefix><\/CommonPrefixes>/g;
  let m;
  while ((m = prefixRe.exec(xml)) !== null) {
    const nome = m[1].replace(prefix, "");
    if (nome && nome !== ".lixeira/") {
      itens.push({ name: nome, id: null, metadata: null });
    }
  }

  // Arquivos (Contents)
  const contentRe = /<Contents>([\s\S]*?)<\/Contents>/g;
  while ((m = contentRe.exec(xml)) !== null) {
    const c    = m[1];
    const key  = (c.match(/<Key>(.*?)<\/Key>/) || [])[1] || "";
    const size = parseInt((c.match(/<Size>(.*?)<\/Size>/) || [])[1] || "0");
    const last = (c.match(/<LastModified>(.*?)<\/LastModified>/) || [])[1] || "";
    const nome = key.replace(prefix, "");
    // Ignora entradas de "pasta" (.keep) e itens de subpastas
    if (nome && !nome.includes("/") && !nome.endsWith(".keep")) {
      itens.push({ name: nome, id: key, metadata: { size, lastModified: last } });
    }
  }

  return itens;
}

function parseSizesXml(xml) {
  const re = /<Size>(.*?)<\/Size>/g;
  let m, total = 0;
  while ((m = re.exec(xml)) !== null) total += parseInt(m[1]) || 0;
  return total;
}

// ── ESTADO ───────────────────────────────────────────────────
let pastaAtual  = "";
let abaAtiva    = "arquivos";
// Guarda os itens selecionados na lixeira: caminho -> ehPasta.
// Fica fora do escopo de renderGrid() de propósito, pra sobreviver a
// re-renderizações (ex: quando o usuário digita na busca).
let itensSelecionadosLixeira = new Map();
let itensCached = [];
let contextAlvo = null;
let renomearAlvo= null;

// ── HELPERS ──────────────────────────────────────────────────
// ── LIXEIRA: preservar a pasta original ─────────────────────────
// Quando um arquivo de dentro de uma subpasta vai pra lixeira, ele
// precisa "lembrar" de qual pasta veio, pra poder voltar pro lugar
// certo ao ser restaurado — e não sempre pra raiz. Só que a listagem
// da lixeira usa delimiter="/" (pra mostrar pastas trashed como
// pastas), então não dá pra simplesmente manter o "/" real dentro do
// nome do arquivo na lixeira, ou ele viraria uma sub-"pasta" confusa
// dentro da lixeira. Por isso codificamos o "/" como "::" no nome
// guardado na lixeira, e decodificamos de volta na hora de restaurar.
function codificarCaminhoParaLixeira(caminhoRelativo) {
  return caminhoRelativo.replace(/\//g, "::");
}
function decodificarCaminhoDaLixeira(nomeCodificado) {
  return nomeCodificado.replace(/::/g, "/");
}

function formatarTamanho(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024)     return bytes + " B";
  if (bytes < 1024**2)  return (bytes/1024).toFixed(1) + " KB";
  if (bytes < 1024**3)  return (bytes/1024**2).toFixed(1) + " MB";
  return (bytes/1024**3).toFixed(2) + " GB";
}

function iconeArquivo(nome) {
  const ext = (nome.split(".").pop() || "").toLowerCase();
  const mapa = {
    pdf:"📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊",
    ppt:"📋", pptx:"📋", txt:"📄", csv:"📊",
    jpg:"🖼", jpeg:"🖼", png:"🖼", gif:"🖼", webp:"🖼", svg:"🖼",
    mp4:"🎬", mov:"🎬", avi:"🎬", mkv:"🎬",
    mp3:"🎵", wav:"🎵", ogg:"🎵",
    zip:"📦", rar:"📦", "7z":"📦",
  };
  return mapa[ext] || "📎";
}

function ehImagem(nome) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(nome);
}

// ── CARREGAMENTO ─────────────────────────────────────────────
async function carregarItens() {
  try {
    const prefix = abaAtiva === "lixeira" ? ".lixeira/" : pastaAtual;
    const xml    = await apiList(prefix);
    let itens    = parseListXml(xml, prefix);

    // Na view normal, esconde lixeira
    if (abaAtiva !== "lixeira") {
      itens = itens.filter(i => !i.name.startsWith(".lixeira"));
    }

    // Limpeza automática de 30 dias na lixeira
    if (abaAtiva !== "lixeira") {
      limparLixeiraExpirada().catch(() => {});
    }

    itensCached = itens;
    renderGrid();
    atualizarUso();
  } catch(e) {
    mostrarToast("Erro ao carregar arquivos: " + e.message, "erro");
  }
}

async function limparLixeiraExpirada() {
  const xml    = await apiList(".lixeira/");
  const itens  = parseListXml(xml, ".lixeira/");
  const TRINTA = 30 * 24 * 60 * 60 * 1000;
  const agora  = Date.now();
  for (const item of itens) {
    const match = item.name.match(/^(\d+)_/);
    if (match && agora - parseInt(match[1]) > TRINTA) {
      await apiDelete(".lixeira/" + item.name).catch(() => {});
    }
  }
}

// ── GRID ─────────────────────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById("gridStorage");
  const semItens = document.getElementById("semItens");
  const busca    = document.getElementById("buscaArquivos").value.trim().toLowerCase();

  grid.innerHTML = "";
  let filtrados = itensCached;
  if (busca) filtrados = filtrados.filter(i => i.name.toLowerCase().includes(busca));

  const pastas   = filtrados.filter(i => !i.id);
  const arquivos = filtrados.filter(i => !!i.id);

  if (pastas.length === 0 && arquivos.length === 0) {
    semItens.style.display = "flex"; return;
  }
  semItens.style.display = "none";

  [...pastas, ...arquivos].forEach(item => grid.appendChild(criarItemEl(item, !item.id)));
  atualizarBarraSelecaoLixeira();
}

function criarItemEl(item, ehPasta) {
  const el        = document.createElement("div");
  el.className    = "item-storage";
  el.dataset.nome = item.name;

  const prefix = abaAtiva === "lixeira" ? ".lixeira/" : pastaAtual;
  const caminho = prefix + item.name;
  el.dataset.caminho = caminho;
  el.dataset.ehPasta = ehPasta ? "1" : "0";

  // "nomeParaAcoes": usado internamente por restaurar/mover/excluir — na
  // lixeira, mantém o caminho original CODIFICADO (com "::" no lugar de
  // "/"), necessário pra saber de qual pasta restaurar depois.
  // "nomeExibido": só o texto mostrado na tela — sempre limpo, sem
  // codificação, mostrando apenas o nome do arquivo/pasta em si.
  const nomeParaAcoes = abaAtiva === "lixeira" ? item.name.replace(/^\d+_/, "") : item.name.replace(/\/$/, "");
  const caminhoOriginalDecodificado = abaAtiva === "lixeira" ? decodificarCaminhoDaLixeira(nomeParaAcoes) : null;
  const nomeExibido = abaAtiva === "lixeira"
    ? (caminhoOriginalDecodificado.replace(/\/$/, "").split("/").pop() || caminhoOriginalDecodificado)
    : item.name.replace(/\/$/, "");
  // Se o item veio de dentro de uma subpasta, mostra de onde — ajuda a
  // saber pra onde ele vai voltar ao restaurar.
  const partesOrigem = abaAtiva === "lixeira" ? caminhoOriginalDecodificado.replace(/\/$/, "").split("/") : [];
  const pastaDeOrigem = partesOrigem.length > 1 ? partesOrigem.slice(0, -1).join("/") + "/" : null;

  const tamanho     = item.metadata?.size ? formatarTamanho(item.metadata.size) : "";

  // Badge de expiração na lixeira
  let badgeLixeira = "";
  if (abaAtiva === "lixeira") {
    const match = item.name.match(/^(\d+)_/);
    if (match) {
      const dias = Math.max(0, Math.round(30 - (Date.now() - parseInt(match[1])) / 86400000));
      const cor  = dias <= 5 ? "#E5141B" : dias <= 10 ? "#E8A000" : "#999";
      badgeLixeira = `<div class="item-meta" style="color:${cor};font-weight:700;">${dias === 0 ? "Expira hoje" : `Expira em ${dias}d`}</div>`;
    }
  }

  // Ícone/thumbnail
  let iconeHtml;
  if (ehPasta) {
    iconeHtml = `<div class="item-icone">📁</div>`;
  } else if (ehImagem(nomeExibido)) {
    const url = apiUrl(caminho);
    iconeHtml = `<img class="item-thumb" src="${url}" alt="${escaparHtml(nomeExibido)}" loading="lazy" onerror="this.outerHTML='<div class=item-icone>🖼</div>'" />`;
  } else {
    iconeHtml = `<div class="item-icone">${iconeArquivo(nomeExibido)}</div>`;
  }

  el.innerHTML = `
    ${abaAtiva === "lixeira" ? `<input type="checkbox" class="item-checkbox" ${itensSelecionadosLixeira.has(caminho) ? "checked" : ""} />` : ""}
    ${iconeHtml}
    <div class="item-nome">${escaparHtml(nomeExibido)}</div>
    ${tamanho ? `<div class="item-meta">${tamanho}</div>` : ""}
    ${pastaDeOrigem ? `<div class="item-meta" style="color:#999;" title="Pasta de origem">📁 ${escaparHtml(pastaDeOrigem)}</div>` : ""}
    ${badgeLixeira}
    <button class="item-menu-btn" title="Opções">⋯</button>
  `;

  if (abaAtiva === "lixeira") {
    const checkbox = el.querySelector(".item-checkbox");
    checkbox.addEventListener("click", (e) => e.stopPropagation()); // não deixa o clique também "selecionar" o card (seleção visual é outra coisa)
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) itensSelecionadosLixeira.set(caminho, ehPasta);
      else itensSelecionadosLixeira.delete(caminho);
      atualizarBarraSelecaoLixeira();
    });
  }

  el.addEventListener("dblclick", () => {
    if (ehPasta) entrarPasta(item.name);
    else abrirPreview(caminho, nomeExibido);
  });

  el.addEventListener("click", (e) => {
    if (e.target.classList.contains("item-menu-btn")) return;
    document.querySelectorAll(".item-storage.selecionado").forEach(i => i.classList.remove("selecionado"));
    el.classList.add("selecionado");
  });

  el.querySelector(".item-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    // Passa nomeParaAcoes (não nomeExibido) para o menu de contexto — é o
    // valor que moverParaLixeira/restaurarDaLixeira/excluirDefinitivo
    // precisam para funcionar corretamente com itens vindos de subpastas.
    abrirContextMenu(e, caminho, nomeParaAcoes, ehPasta);
  });

  return el;
}

// ── SELEÇÃO EM MASSA (lixeira) ──────────────────────────────────
function atualizarBarraSelecaoLixeira() {
  const barra = document.getElementById("barraSelecaoLixeira");
  const btnExcluir = document.getElementById("btnExcluirSelecionados");
  const texto = document.getElementById("textoSelecionados");
  const checkTudo = document.getElementById("checkSelecionarTudo");

  if (abaAtiva !== "lixeira") { barra.style.display = "none"; return; }
  barra.style.display = "flex";

  const qtd = itensSelecionadosLixeira.size;
  btnExcluir.style.display = qtd > 0 ? "inline-block" : "none";
  texto.textContent = qtd > 0 ? `${qtd} selecionado(s)` : "Selecionar tudo";

  // Reflete no checkbox "selecionar tudo" se todos os itens VISÍVEIS
  // (considerando a busca atual) já estão marcados.
  const visiveisNaTela = document.querySelectorAll(".item-storage").length;
  checkTudo.checked = visiveisNaTela > 0 && qtd >= visiveisNaTela;
}

document.getElementById("checkSelecionarTudo").addEventListener("change", (e) => {
  const marcado = e.target.checked;
  itensSelecionadosLixeira.clear();
  if (marcado) {
    document.querySelectorAll(".item-storage").forEach((el) => {
      const checkbox = el.querySelector(".item-checkbox");
      if (!checkbox) return;
      checkbox.checked = true;
      itensSelecionadosLixeira.set(el.dataset.caminho, el.dataset.ehPasta === "1");
    });
  } else {
    document.querySelectorAll(".item-checkbox").forEach((c) => { c.checked = false; });
  }
  atualizarBarraSelecaoLixeira();
});

document.getElementById("btnExcluirSelecionados").addEventListener("click", async () => {
  const qtd = itensSelecionadosLixeira.size;
  if (qtd === 0) return;
  const ok = await confirmarAcao(
    `Excluir ${qtd} item(ns) selecionado(s) definitivamente?`,
    "Essa ação não pode ser desfeita — os arquivos são apagados de vez do Drive."
  );
  if (!ok) return;

  let falhas = 0;
  for (const [caminho, ehPasta] of itensSelecionadosLixeira) {
    try {
      if (ehPasta) await apiDeletePrefix(caminho);
      else await apiDelete(caminho);
    } catch (e) { falhas++; }
  }

  itensSelecionadosLixeira.clear();
  if (falhas === 0) mostrarToast(`${qtd} item(ns) excluído(s) definitivamente.`);
  else mostrarToast(`${qtd - falhas} de ${qtd} excluído(s) — ${falhas} falharam.`, "erro");
  carregarItens();
});

// ── PASTAS ───────────────────────────────────────────────────
function entrarPasta(nome) {
  pastaAtual = pastaAtual + nome;
  atualizarBreadcrumb();
  carregarItens();
}

function atualizarBreadcrumb() {
  const bc  = document.getElementById("breadcrumb");
  const sub = document.getElementById("subtituloAtual");
  bc.innerHTML = `<span class="bc-item bc-raiz" data-pasta="">☁ Início</span>`;

  if (pastaAtual) {
    const partes = pastaAtual.replace(/\/$/, "").split("/");
    let cam = "";
    partes.forEach(parte => {
      cam += parte + "/";
      bc.innerHTML += `<span class="bc-sep">›</span>`;
      const span = document.createElement("span");
      span.className = "bc-item";
      span.textContent = parte;
      span.dataset.pasta = cam;
      bc.appendChild(span);
    });
    sub.textContent = partes[partes.length - 1];
  } else {
    sub.textContent = "Todos os arquivos";
  }

  bc.querySelectorAll(".bc-item").forEach(item => {
    item.addEventListener("click", () => {
      pastaAtual = item.dataset.pasta;
      atualizarBreadcrumb();
      carregarItens();
    });
  });
}

async function criarPasta(nome) {
  try {
    const caminho = pastaAtual + nome + "/.keep";
    await apiUpload(caminho, new Blob([""]), () => {});
    mostrarToast("Pasta criada.");
    carregarItens();
  } catch(e) { mostrarToast("Erro: " + e.message, "erro"); }
}

// ── UPLOAD ───────────────────────────────────────────────────
async function uploadArquivos(arquivos) {
  for (const arquivo of arquivos) {
    const caminho = pastaAtual + arquivo.name;
    mostrarToastUpload(arquivo.name, 0);
    try {
      await apiUpload(caminho, arquivo, pct => atualizarToastUpload(arquivo.name, pct));
    } catch(e) {
      mostrarToast("Erro ao enviar " + arquivo.name + ": " + e.message, "erro");
    }
  }
  esconderToastUpload();
  mostrarToast(arquivos.length > 1 ? `${arquivos.length} arquivos enviados.` : "Arquivo enviado.");
  carregarItens();
}

function mostrarToastUpload(nome, pct) {
  const toast = document.getElementById("uploadToast");
  document.getElementById("uploadToastNome").textContent = nome.length > 30 ? nome.slice(0,30)+"…" : nome;
  document.getElementById("uploadToastPct").textContent  = Math.round(pct * 100) + "%";
  document.getElementById("uploadToastFill").style.width = (pct * 100) + "%";
  toast.style.display = "block";
}
function atualizarToastUpload(nome, pct) { mostrarToastUpload(nome, pct); }
function esconderToastUpload() { document.getElementById("uploadToast").style.display = "none"; }

// ── LIXEIRA ──────────────────────────────────────────────────
async function moverParaLixeira(caminho, nome, ehPasta) {
  // Usa "caminho" (o caminho completo original, incluindo a pasta) em vez
  // de só o nome do arquivo — assim, ao restaurar depois, dá pra voltar
  // pro lugar certo em vez de sempre cair na raiz.
  const caminhoSemBarraFinal = caminho.replace(/\/$/, "");
  const codificado = codificarCaminhoParaLixeira(caminhoSemBarraFinal);
  const destino = ehPasta ? `.lixeira/${Date.now()}_${codificado}/` : `.lixeira/${Date.now()}_${codificado}`;
  try {
    if (ehPasta) await apiMovePrefix(caminho, destino);
    else await apiMove(caminho, destino);
    mostrarToast(ehPasta ? "Pasta movida para a lixeira." : "Movido para a lixeira.");
    carregarItens();
  } catch (e) { mostrarToast("Erro: " + e.message, "erro"); }
}

async function restaurarDaLixeira(caminho, nome, ehPasta) {
  // "nome" aqui é nomeParaAcoes (já com o timestamp removido, mas ainda
  // codificado com "::" no lugar de "/") — decodifica para recuperar o
  // caminho original completo, incluindo a subpasta de onde veio.
  const nomeOriginal = decodificarCaminhoDaLixeira(nome);
  try {
    if (ehPasta) await apiMovePrefix(caminho, nomeOriginal.endsWith("/") ? nomeOriginal : nomeOriginal + "/");
    else await apiMove(caminho, nomeOriginal);
    mostrarToast(ehPasta ? "Pasta restaurada." : "Arquivo restaurado.");
    carregarItens();
  } catch (e) { mostrarToast("Erro ao restaurar: " + e.message, "erro"); }
}

async function excluirDefinitivo(caminho, ehPasta) {
  try {
    if (ehPasta) await apiDeletePrefix(caminho);
    else await apiDelete(caminho);
    mostrarToast(ehPasta ? "Pasta excluída definitivamente." : "Excluído definitivamente.");
    carregarItens();
  } catch (e) { mostrarToast("Erro ao excluir: " + e.message, "erro"); }
}

// ── RENOMEAR ─────────────────────────────────────────────────
async function renomear(caminhoAntigo, novoNome) {
  const pasta   = caminhoAntigo.split("/").slice(0,-1).join("/");
  const destino = pasta ? pasta + "/" + novoNome : novoNome;
  try { await apiMove(caminhoAntigo, destino); mostrarToast("Renomeado."); carregarItens(); }
  catch(e) { mostrarToast("Erro ao renomear: " + e.message, "erro"); }
}

// ── PREVIEW ──────────────────────────────────────────────────
function abrirPreview(caminho, nome) {
  const url   = apiUrl(caminho);
  const corpo = document.getElementById("previewCorpo");
  document.getElementById("previewNome").textContent    = nome;
  document.getElementById("previewDownload").href       = url;
  document.getElementById("previewDownload").download   = nome;

  const ext = nome.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) {
    corpo.innerHTML = `<img src="${url}" alt="${escaparHtml(nome)}" />`;
  } else if (ext === "pdf") {
    corpo.innerHTML = `<embed src="${url}" type="application/pdf" />`;
  } else if (["mp4","mov","webm"].includes(ext)) {
    corpo.innerHTML = `<video src="${url}" controls></video>`;
  } else {
    corpo.innerHTML = `<div class="preview-sem-suporte"><div class="ps-icone">${iconeArquivo(nome)}</div><p>Pré-visualização não disponível.</p><br/><a href="${url}" download="${escaparHtml(nome)}" class="btn-acao">⬇ Baixar arquivo</a></div>`;
  }
  document.getElementById("modalPreview").classList.add("active");
}

// ── MENU DE CONTEXTO ─────────────────────────────────────────
function fecharContextMenu() {
  document.querySelectorAll(".context-menu").forEach(m => m.remove());
  contextAlvo = null;
}

function abrirContextMenu(e, caminho, nomeDisplay, ehPasta) {
  fecharContextMenu();
  contextAlvo = { caminho, nomeDisplay, ehPasta };
  const menu = document.createElement("div");
  menu.className = "context-menu";

  if (abaAtiva === "lixeira") {
    menu.innerHTML = `<div class="context-item" data-acao="restaurar">↩ Restaurar</div><div class="context-item perigo" data-acao="excluir-def">🗑 Excluir definitivo</div>`;
  } else if (ehPasta) {
    menu.innerHTML = `<div class="context-item" data-acao="abrir">📂 Abrir</div><div class="context-item" data-acao="renomear">✏ Renomear</div><div class="context-item perigo" data-acao="lixeira">🗑 Mover para lixeira</div>`;
  } else {
    menu.innerHTML = `<div class="context-item" data-acao="preview">👁 Visualizar</div><div class="context-item" data-acao="download">⬇ Baixar</div><div class="context-item" data-acao="renomear">✏ Renomear</div><div class="context-item perigo" data-acao="lixeira">🗑 Mover para lixeira</div>`;
  }

  menu.style.cssText = `top:${e.clientY}px;left:${e.clientX}px;`;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (e.clientX - rect.width) + "px";
  if (rect.bottom > window.innerHeight) menu.style.top  = (e.clientY - rect.height) + "px";

  menu.querySelectorAll(".context-item").forEach(item => {
    item.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      // IMPORTANTE: captura os dados ANTES de fechar o menu — fecharContextMenu()
      // zera contextAlvo, então ler depois sempre dava undefined (bug que fazia
      // "mover para lixeira" e outras ações do menu falharem com key=undefined).
      const { caminho, nomeDisplay, ehPasta } = contextAlvo || {};
      fecharContextMenu();
      const acao = item.dataset.acao;
      if (acao === "abrir")    entrarPasta(nomeDisplay + "/");
      if (acao === "preview")  abrirPreview(caminho, nomeDisplay);
      if (acao === "download") window.open(apiUrl(caminho), "_blank");
      if (acao === "renomear") abrirRenomear(caminho, nomeDisplay);
      if (acao === "lixeira") {
        const ok = await confirmarAcao(
          ehPasta ? "Mover esta pasta (e tudo dentro dela) para a lixeira?" : "Mover para lixeira?",
          "Pode ser restaurado depois."
        );
        if (ok) moverParaLixeira(caminho, nomeDisplay, ehPasta);
      }
      if (acao === "restaurar") restaurarDaLixeira(caminho, nomeDisplay, ehPasta);
      if (acao === "excluir-def") {
        const ok = await confirmarAcao(
          ehPasta ? "Excluir esta pasta (e tudo dentro dela) definitivamente?" : "Excluir definitivamente?",
          "Esta ação não pode ser desfeita."
        );
        if (ok) excluirDefinitivo(caminho, ehPasta);
      }
    });
  });

  document.addEventListener("click", fecharContextMenu, { once: true });
}

function abrirRenomear(caminho, nomeAtual) {
  renomearAlvo = caminho;
  document.getElementById("campoNovoNome").value = nomeAtual;
  document.getElementById("modalRenomear").classList.add("active");
  setTimeout(() => document.getElementById("campoNovoNome").select(), 50);
}

// ── USO ──────────────────────────────────────────────────────
async function atualizarUso() {
  try {
    const xml   = await apiListAll();
    const total = parseSizesXml(xml);
    const pct   = Math.min((total / STORAGE_LIMIT) * 100, 100);
    const usado = formatarTamanho(total);
    const cor   = pct > 80 ? "#E5141B" : pct > 60 ? "#E8A000" : "#FF6A00";

    document.getElementById("usoValores").textContent    = `${usado} / 10 GB`;
    const barra = document.getElementById("usoBarra");
    barra.style.width      = pct + "%";
    barra.style.background = cor;
    document.getElementById("usoPorcentagem").textContent = pct.toFixed(1) + "%";
    document.getElementById("usoPorcentagem").style.color = cor;

    document.getElementById("widgetProgresso").style.width      = pct + "%";
    document.getElementById("widgetProgresso").style.background = cor;
    document.getElementById("widgetTexto").textContent = `${usado} de 10 GB (${pct.toFixed(0)}%)`;
  } catch(_) {
    document.getElementById("widgetTexto").textContent = "—";
  }
}

// ── EVENTOS ──────────────────────────────────────────────────
document.querySelectorAll(".aba-storage").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aba-storage").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    abaAtiva   = btn.dataset.aba;
    pastaAtual = "";
    itensSelecionadosLixeira.clear();
    atualizarBreadcrumb();
    carregarItens();
  });
});

document.getElementById("inputUpload").addEventListener("change", (e) => {
  if (e.target.files.length) uploadArquivos([...e.target.files]);
  e.target.value = "";
});

const dropZone = document.getElementById("dropZone");
document.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("ativo"); });
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) dropZone.classList.remove("ativo"); });
document.addEventListener("drop", (e) => {
  e.preventDefault(); dropZone.classList.remove("ativo");
  const arqs = [...e.dataTransfer.files];
  if (arqs.length) uploadArquivos(arqs);
});

document.getElementById("btnNovasPasta").addEventListener("click", () => {
  document.getElementById("campoNomePasta").value = "";
  document.getElementById("modalPasta").classList.add("active");
  setTimeout(() => document.getElementById("campoNomePasta").focus(), 50);
});
document.getElementById("fecharModalPasta").addEventListener("click",  () => document.getElementById("modalPasta").classList.remove("active"));
document.getElementById("cancelarPasta").addEventListener("click",     () => document.getElementById("modalPasta").classList.remove("active"));
document.getElementById("confirmarPasta").addEventListener("click", () => {
  const nome = document.getElementById("campoNomePasta").value.trim();
  if (!nome) { mostrarToast("Informe o nome da pasta.", "erro"); return; }
  document.getElementById("modalPasta").classList.remove("active");
  criarPasta(nome);
});
document.getElementById("campoNomePasta").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("confirmarPasta").click(); });

document.getElementById("fecharModalRenomear").addEventListener("click",  () => document.getElementById("modalRenomear").classList.remove("active"));
document.getElementById("cancelarRenomear").addEventListener("click",     () => document.getElementById("modalRenomear").classList.remove("active"));
document.getElementById("confirmarRenomear").addEventListener("click", () => {
  const novo = document.getElementById("campoNovoNome").value.trim();
  if (!novo || !renomearAlvo) return;
  document.getElementById("modalRenomear").classList.remove("active");
  renomear(renomearAlvo, novo);
  renomearAlvo = null;
});
document.getElementById("campoNovoNome").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("confirmarRenomear").click(); });

document.getElementById("fecharPreview").addEventListener("click", () => {
  document.getElementById("modalPreview").classList.remove("active");
  document.getElementById("previewCorpo").innerHTML = "";
});
document.getElementById("modalPreview").addEventListener("click", (e) => {
  if (e.target.id === "modalPreview") {
    document.getElementById("modalPreview").classList.remove("active");
    document.getElementById("previewCorpo").innerHTML = "";
  }
});

document.getElementById("buscaArquivos").addEventListener("input", renderGrid);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    fecharContextMenu();
    ["modalPasta","modalRenomear","modalPreview"].forEach(id => document.getElementById(id).classList.remove("active"));
  }
});

// ── TOAST ────────────────────────────────────────────────────
function mostrarToast(msg, tipo) {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${tipo==="erro"?"#E5141B":"#1A1A1A"};color:#fff;padding:10px 22px;border-radius:100px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
garantirTokenDownload().then(() => {
  atualizarBreadcrumb();
  carregarItens();
});