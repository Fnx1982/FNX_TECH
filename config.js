// ============================================================
// config.js — CONFIGURAÇÃO GERAL DO SITE FNX TECH
// Este é o ÚNICO arquivo que você precisa mexer para ligar o site
// ao seu Worker do Cloudflare e preencher os dados da empresa.
// Ele é carregado antes de todos os outros scripts, em todas as
// páginas.
// ============================================================

// 1) Endereço do Worker da FNX TECH (Cloudflare → Workers → o seu
//    Worker → copie a URL que termina em .workers.dev). Sem barra
//    no final.
const FNX_API = /(^|\.)sistemafnx\.com$/.test(location.hostname) ? "https://api.sistemafnx.com" : "https://fnx-tech-backend.holdingfnx.workers.dev";

// 2) Dados da empresa — usados nos PDFs (propostas, notas,
//    apresentações, extrato de ponto). Deixe "" o que ainda não tiver.
const FNX_EMPRESA = {
  nome: "FNX TECH",
  razaoSocial: "FNX TECH",
  cnpj: "",
  endereco: "",
  bairro: "",
  cidade: "",
  estado: "",
  uf: "",
  cep: "",
  fone: "",
  fone2: "",
  email: "",
  instagram: "",
  site: "",
};

// 3) Links das mídias sociais (menu "Mídias Sociais"). Deixe "" para
//    o item aparecer como "em breve".
const FNX_LINKS = {
  facebook: "",
  instagram: "",
  site: "",
};

// 4) Integração com o Google Agenda (Calendário). Opcional — deixe
//    "" para desligar. Crie as chaves no Google Cloud Console em nome
//    da FNX TECH (não reaproveite as de outra empresa).
const FNX_GOOGLE_CLIENT_ID = "427826556766-52fl3ihfrtivstnaqg700iscbc23oqcr.apps.googleusercontent.com";
const FNX_GOOGLE_API_KEY = "AIzaSyDxJY_fzB03iBTV2XMfX83_YbeMedX_sHU";
