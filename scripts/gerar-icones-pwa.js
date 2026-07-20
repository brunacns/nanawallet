// Gera os ícones PNG da PWA (pwa/icones/icon-*.png) sem nenhuma biblioteca —
// só Node puro (zlib já vem embutido). Necessário porque o Safari/iOS exige
// PNG de verdade para apple-touch-icon e para os ícones do manifest (SVG não
// funciona para isso), e este projeto não tem nenhuma ferramenta de imagem
// instalada. Rodar de novo só é preciso se as cores da marca mudarem
// (`npm run gerar-icones`).
//
// Desenho: gradiente diagonal lilás -> rosa, igual ao --gradiente-acento
// usado no logo da sidebar (src/css/variaveis.css) — full-bleed (sem cantos
// arredondados nem transparência), porque tanto o iOS quanto o Android já
// aplicam a própria máscara de recorte em cima de um ícone quadrado.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pastaIcones = path.join(__dirname, "..", "pwa", "icones");
fs.mkdirSync(pastaIcones, { recursive: true });

const COR_INICIO = [201, 163, 245]; // --cor-acento (#c9a3f5)
const COR_FIM = [240, 168, 216]; // --cor-rosa (#f0a8d8)

function montarCrcTable() {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
}
const TABELA_CRC = montarCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = TABELA_CRC[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function montarChunk(tipo, dados) {
  const tipoBuffer = Buffer.from(tipo, "ascii");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuffer, dados])), 0);

  return Buffer.concat([tamanho, tipoBuffer, dados, crc]);
}

function gerarPng(tamanho) {
  const pixels = Buffer.alloc(tamanho * tamanho * 4);

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      // Aproxima um gradiente de 135deg (canto superior-esquerdo -> inferior-direito).
      const t = (x + y) / (2 * (tamanho - 1));
      const indice = (y * tamanho + x) * 4;
      pixels[indice] = Math.round(COR_INICIO[0] + (COR_FIM[0] - COR_INICIO[0]) * t);
      pixels[indice + 1] = Math.round(COR_INICIO[1] + (COR_FIM[1] - COR_INICIO[1]) * t);
      pixels[indice + 2] = Math.round(COR_INICIO[2] + (COR_FIM[2] - COR_INICIO[2]) * t);
      pixels[indice + 3] = 255;
    }
  }

  // Cada linha (scanline) precisa de um byte de filtro (0 = nenhum) na frente.
  const bytesPorLinha = tamanho * 4;
  const bruto = Buffer.alloc((bytesPorLinha + 1) * tamanho);
  for (let y = 0; y < tamanho; y++) {
    bruto[y * (bytesPorLinha + 1)] = 0;
    pixels.copy(bruto, y * (bytesPorLinha + 1) + 1, y * bytesPorLinha, (y + 1) * bytesPorLinha);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compressão
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // interlace

  const assinatura = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(bruto);

  return Buffer.concat([assinatura, montarChunk("IHDR", ihdr), montarChunk("IDAT", idat), montarChunk("IEND", Buffer.alloc(0))]);
}

for (const tamanho of [180, 192, 512]) {
  const destino = path.join(pastaIcones, `icon-${tamanho}.png`);
  fs.writeFileSync(destino, gerarPng(tamanho));
  console.log(`[gerar-icones-pwa] gerado: ${destino}`);
}
