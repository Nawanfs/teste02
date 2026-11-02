#!/usr/bin/env node
// Monta o vídeo final da Parte 2 a partir dos clipes da OpenArt.
//   node preso_no_jogo/parte2/montar.mjs [--rascunho]
// Lê cenas.json. Clipe que ainda não existe em clipes/ vira um quadro azul-marinho
// com o nome da cena (para conferir tempos antes de ter tudo).
// Se existir narracao.wav (ou .mp3) nesta pasta, ela entra na mixagem e os efeitos abaixam sob a voz.
// Saída: saida/parte2.mp4 (1080x1920, 30 qps) e saida/folha.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const FONTES = path.join(RAIZ, 'estudio/espaco/fontes');
const cfg = JSON.parse(fs.readFileSync(path.join(AQUI, 'cenas.json'), 'utf8'));
const rascunho = process.argv.includes('--rascunho');
const W = 1080, H = 1920, FPS = 30;
const SAIDA = path.join(AQUI, 'saida');
const TMP = path.join(SAIDA, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const total = cfg.cenas.reduce((s, c) => s + c.dur, 0);

// ---------- 1. cenas normalizadas ----------
const partes = [];
let t0 = 0;
for (const c of cfg.cenas) {
  const out = path.join(TMP, `${c.id}.mp4`);
  const src = c.arquivo && path.join(AQUI, c.arquivo);
  const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`;
  const img = c.imagem && path.join(AQUI, c.imagem);
  if (src && fs.existsSync(src)) {
    // se o clipe for mais curto que a cena, congela o último quadro; "reverso" toca de trás pra frente
    const rev = c.reverso ? 'reverse,' : '';
    ff(['-i', src, '-vf', `${rev}${norm},tpad=stop_mode=clone:stop_duration=${c.dur}`, '-t', String(c.dur), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out]);
  } else if (img && fs.existsSync(img)) {
    // sem o vídeo: a imagem-chave com zoom lento (e um tranco rápido se houver susto nesta cena)
    const n = c.dur * FPS;
    const susto = cfg.sustos.find((s) => s >= t0 && s < t0 + c.dur);
    const zs = susto != null ? Math.round((susto - t0) * FPS) : -1;
    const z = zs >= 0 ? `if(lt(on,${zs}),1+0.06*on/${zs},1.25+0.05*(on-${zs})/${n})` : `1+0.10*on/${n}`;
    ff(['-loop', '1', '-i', img, '-vf',
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS},format=yuv420p`,
      '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out]);
  } else {
    const label = c.arquivo ? `FALTA ${c.id}` : '';
    const dt = label ? `,drawtext=fontfile=${FONTES}/SpaceGrotesk-Bold.otf:text='${label}':fontcolor=0x2a4a6a:fontsize=60:x=(w-tw)/2:y=h*0.42` : '';
    ff(['-f', 'lavfi', '-i', `color=c=0x05080f:s=${W}x${H}:r=${FPS}:d=${c.dur}`, '-vf', `format=yuv420p${dt}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out]);
  }
  partes.push(out);
  t0 += c.dur;
}
const lista = path.join(TMP, 'lista.txt');
fs.writeFileSync(lista, partes.map((p) => `file '${p}'`).join('\n'));
const base = path.join(TMP, 'base.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', base]);

// ---------- 2. interface e legendas (ASS) ----------
const ts = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};
const ev = (a, b, style, text, layer = 0) => `Dialogue: ${layer},${ts(a)},${ts(b)},${style},,0,0,0,,${text}`;
const COR2 = '&H3CC9FF&'; // segunda linha da legenda: amarelo-laranja (BGR)
const linhas = [];

// gancho escrito na tela desde o primeiro quadro
linhas.push(ev(0, 5.0, 'Gancho', `{\\fad(0,200)}E SE O MONSTRO QUE\\NCOPIOU SEU CACHORRO...\\N{\\c${COR2}}AGORA COPIASSE VOCÊ?`));

// legendas: 1ª linha branca, 2ª colorida, com um "pop" na entrada
for (const [a, b, l1, l2] of cfg.legendas) {
  linhas.push(ev(a, b, 'Legenda', `{\\fscx80\\fscy80\\t(0,90,\\fscx100\\fscy100)}${l1}\\N{\\c${COR2}}${l2}`));
}

// relógio vermelho: de 03:20 a 03:41 ao longo do vídeo
const [m0, s0] = cfg.relogio.de.split(':').map(Number);
const [m1, s1] = cfg.relogio.ate.split(':').map(Number);
const ini = m0 * 60 + s0, fim = m1 * 60 + s1, passos = fim - ini;
for (let i = 0; i <= passos; i++) {
  const a = (i / (passos + 1)) * total, b = ((i + 1) / (passos + 1)) * total;
  const v = ini + i;
  const txt = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  linhas.push(ev(a, b, 'Relogio', `{\\an9\\pos(${W - 50},70)}● ${txt}`, 2));
}

// caixa de regras (canto superior esquerdo)
const fimRegras = total - cfg.cenas.at(-1).dur;
const caixa = (h) => `{\\an7\\pos(40,150)\\p1\\bord2\\3c&HFFE000&\\1c&H140A05&\\1a&H40&}m 0 0 l 560 0 l 560 ${h} l 0 ${h}{\\p0}`;
linhas.push(ev(0, cfg.regra4.entra, 'Caixa', caixa(250), 1));
linhas.push(ev(cfg.regra4.entra, fimRegras, 'Caixa', caixa(310), 1));
const regras = `{\\an7\\pos(62,166)}{\\c&HFFE000&\\b1}REGRAS · DEFESA CIVIL{\\b0\\c&HFFFFFF&}\\N${cfg.regras.join('\\N')}`;
linhas.push(ev(0, cfg.regra4.entra, 'Regras', regras, 3));
linhas.push(ev(cfg.regra4.entra, fimRegras, 'Regras',
  `${regras}\\N{\\c&H3030FF&\\t(0,300,\\fscx100)}${cfg.regra4.texto}`, 3));
// destaque da regra 4 no centro quando ela entra
linhas.push(ev(cfg.regra4.entra, cfg.regra4.entra + 2.4, 'Alerta',
  `{\\fad(80,200)\\fscx60\\fscy60\\t(0,150,\\fscx100\\fscy100)}REGRA 4\\N{\\c&HFFFFFF&\\fs58}NÃO RESPONDA SE\\NCHAMAREM SEU NOME`, 4));

// sustos: clarão branco de 4 quadros
for (const s of cfg.sustos) {
  linhas.push(ev(s, s + 0.14, 'Caixa', `{\\an7\\pos(0,0)\\p1\\1c&HFFFFFF&\\bord0\\fad(0,90)}m 0 0 l ${W} 0 l ${W} ${H} l 0 ${H}{\\p0}`, 9));
}

// final: cartões A/B, inscrever e nome do canal
const f0 = fimRegras, f1 = total;
const cartao = (x, cor) => `{\\an7\\pos(${x},620)\\p1\\bord4\\3c${cor}\\1c&H0A0A0A&\\fad(150,0)}m 0 0 l 440 0 l 440 520 l 0 520{\\p0}`;
linhas.push(ev(f0, f1, 'Caixa', cartao(80, '&H50D050&'), 5));
linhas.push(ev(f0, f1, 'Caixa', cartao(560, '&H4040E0&'), 5));
linhas.push(ev(f0, f1, 'Final', `{\\an8\\pos(300,660)\\c&H50D050&\\fs150}A{\\fs52\\c&HFFFFFF&}\\NFECHA O\\NPORTÃO E\\NSE SALVA`, 6));
linhas.push(ev(f0, f1, 'Final', `{\\an8\\pos(780,660)\\c&H4040E0&\\fs150}B{\\fs52\\c&HFFFFFF&}\\NVOLTA PRA\\NBUSCAR O MAX`, 6));
linhas.push(ev(f0, f1, 'Final', `{\\an8\\pos(540,300)\\fs96\\c&H3CC9FF&}${cfg.titulo}`, 6));
linhas.push(ev(f0 + 0.6, f1, 'Caixa', `{\\an7\\pos(330,1240)\\p1\\1c&H0000E0&\\bord0\\fad(120,0)}m 0 0 l 420 0 l 420 110 l 0 110{\\p0}`, 5));
linhas.push(ev(f0 + 0.6, f1, 'Final', `{\\an5\\pos(540,1295)\\fs58\\fad(120,0)}INSCREVA-SE`, 6));

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,Space Grotesk,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,7,3,2,60,60,330,1
Style: Gancho,Space Grotesk,70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,0,8,60,60,520,1
Style: Relogio,Space Grotesk,64,&H003030FF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,5,0,9,40,40,40,1
Style: Caixa,Space Grotesk,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Regras,Space Grotesk,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1
Style: Alerta,Space Grotesk,120,&H003030FF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,8,0,5,60,60,0,1
Style: Final,Space Grotesk,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,0,8,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${linhas.join('\n')}
`;
const assArq = path.join(TMP, 'interface.ass');
fs.writeFileSync(assArq, ass);

// tremida de câmera nos sustos (0,6 s depois de cada um) + interface por cima
const tremida = cfg.sustos.map((s) => `between(t,${s},${s + 0.6})`).join('+');
const vf = [
  `scale=${W + 60}:${H + 106}`,
  `crop=${W}:${H}:'30+if(${tremida},24*sin(t*90),0)':'53+if(${tremida},24*cos(t*77),0)'`,
  `ass=${assArq}:fontsdir=${FONTES}`,
].join(',');
const video = path.join(TMP, 'video.mp4');
ff(['-i', base, '-vf', vf, '-c:v', 'libx264', '-preset', rascunho ? 'veryfast' : 'slow', '-crf', rascunho ? '23' : '17', '-pix_fmt', 'yuv420p', video]);

// ---------- 3. som ----------
// chuva (ruído marrom filtrado) + zumbido grave + estrondo/grito nos sustos + música calma na cena da mãe
const sons = [];
const SR = 48000;
const gen = (nome, expr, dur) => {
  const f = path.join(TMP, `${nome}.wav`);
  ff(['-f', 'lavfi', '-i', expr, '-t', String(dur), '-ar', String(SR), '-ac', '2', f]);
  return f;
};
const chuva = gen('chuva', `anoisesrc=c=brown:a=0.35:r=${SR}`, total);
const drone = gen('drone', `aevalsrc=0.10*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.2*t))+0.05*sin(2*PI*82.4*t):s=${SR}`, total);
const estrondo = gen('estrondo', `aevalsrc=0.9*sin(2*PI*(70-40*t)*t)*exp(-3*t)+0.4*(random(0)-0.5)*exp(-8*t):s=${SR}`, 2.0);
const grito = gen('grito', `aevalsrc=0.35*sin(2*PI*(900+1600*t)*t+3*sin(2*PI*7*t))*exp(-2.2*t)+0.15*(random(0)-0.5)*exp(-4*t):s=${SR}`, 1.2);
const ini_mae = 21, corte_mae = cfg.sustos[1];
const musica = gen('musica', `aevalsrc=0.06*(sin(2*PI*261.6*t)+sin(2*PI*329.6*t)+sin(2*PI*392*t))*(1-exp(-2*t)):s=${SR}`, corte_mae - ini_mae);

const entradas = ['-i', video, '-i', chuva, '-i', drone, '-i', musica];
let filtro = `[1:a]lowpass=f=1800,volume=0.5[ch];[2:a]volume=1[dr];[3:a]adelay=${ini_mae * 1000}|${ini_mae * 1000}[mu];`;
const mix = ['[ch]', '[dr]', '[mu]'];
let idx = 4;
cfg.sustos.forEach((s, i) => {
  entradas.push('-i', estrondo, '-i', grito);
  const d = Math.round(s * 1000);
  filtro += `[${idx}:a]adelay=${d}|${d}[e${i}];[${idx + 1}:a]adelay=${d}|${d}[g${i}];`;
  mix.push(`[e${i}]`, `[g${i}]`);
  idx += 2;
});
const narr = ['narracao.wav', 'narracao.mp3'].map((n) => path.join(AQUI, n)).find(fs.existsSync);
let saidaAudio;
if (narr) {
  entradas.push('-i', narr);
  filtro += `${mix.join('')}amix=inputs=${mix.length}:normalize=0[fx];[${idx}:a]aresample=${SR},asplit=2[vz][sc];[fx][sc]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=300[fxd];[fxd][vz]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
} else {
  filtro += `${mix.join('')}amix=inputs=${mix.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
}
fs.mkdirSync(SAIDA, { recursive: true });
const final = path.join(SAIDA, 'parte2.mp4');
ff([...entradas, '-filter_complex', filtro, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), '-movflags', '+faststart', final]);

// folha de contato: um quadro a cada 3 s
ff(['-i', final, '-vf', `fps=1/3,scale=270:-1,tile=6x3`, '-frames:v', '1', path.join(SAIDA, 'folha.jpg')]);
console.log(`pronto: ${path.relative(RAIZ, final)} (${total} s${narr ? ', com narração' : ', sem narração'})`);
