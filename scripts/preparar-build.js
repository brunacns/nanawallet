// Executado automaticamente pelo Tauri antes de "tauri dev"/"tauri build"
// (configurado em src-tauri/tauri.conf.json, seção "build"). Também pode ser
// rodado manualmente com `npm run preparar-build`.
//
// O que faz:
// 1. Lê a versão de src-tauri/tauri.conf.json (fonte única da verdade) e
//    espelha em package.json e Cargo.toml, para as três nunca ficarem
//    dessincronizadas (só precisa mudar a versão em UM lugar).
// 2. Regrava src/js/build-info.json com a versão e a data/hora deste build —
//    é isso que a página Configurações mostra como "Data da build" e
//    "Última atualização".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, "..");
const caminhoTauriConf = path.join(raiz, "src-tauri", "tauri.conf.json");
const caminhoPackageJson = path.join(raiz, "package.json");
const caminhoCargoToml = path.join(raiz, "src-tauri", "Cargo.toml");
const caminhoBuildInfo = path.join(raiz, "src", "js", "build-info.json");

const tauriConf = JSON.parse(fs.readFileSync(caminhoTauriConf, "utf8"));
const versao = tauriConf.version;

if (!versao) {
  throw new Error('Não encontrei "version" em src-tauri/tauri.conf.json — defina a versão lá antes de buildar.');
}

// 1a. Sincroniza package.json
const packageJson = JSON.parse(fs.readFileSync(caminhoPackageJson, "utf8"));
if (packageJson.version !== versao) {
  packageJson.version = versao;
  fs.writeFileSync(caminhoPackageJson, JSON.stringify(packageJson, null, 2) + "\n");
}

// 1b. Sincroniza Cargo.toml (só a linha "version = ..." de [package], não as
// versões de dependências como `tauri = { version = "2" }`, que não começam
// a linha com "version").
const cargoToml = fs.readFileSync(caminhoCargoToml, "utf8");
const cargoTomlAtualizado = cargoToml.replace(/^version = ".*"$/m, `version = "${versao}"`);
if (cargoTomlAtualizado !== cargoToml) {
  fs.writeFileSync(caminhoCargoToml, cargoTomlAtualizado);
}

// 2. Regrava a data da build (sempre, a cada dev/build) em horário LOCAL —
// não UTC, pelo mesmo motivo do hojeISO() em utils/datas.js: evita mostrar
// a data errada perto da meia-noite no fuso do Brasil.
const agora = new Date();
const pad = (n) => String(n).padStart(2, "0");
const dataBuild = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}T${pad(agora.getHours())}:${pad(
  agora.getMinutes()
)}:${pad(agora.getSeconds())}`;

fs.writeFileSync(caminhoBuildInfo, JSON.stringify({ versao, dataBuild }, null, 2) + "\n");

console.log(`[preparar-build] versão ${versao} · build gerada em ${dataBuild}`);
