const axios = require('axios');
const cheerio = require('cheerio');
const tls = require('tls');
const dns = require('dns').promises;
const ip = require('ip');
const fs = require('fs');

const site = 'https://m.doubleclick.net';

async function extrairDominios(siteUrl) {
  try {
    const res = await axios.get(siteUrl);
    const $ = cheerio.load(res.data);
    const dominios = new Set();

    $('a[href], script[src], link[href], img[src]').each((i, el) => {
      const url = $(el).attr('href') || $(el).attr('src');
      if (url && url.includes('.')) {
        try {
          const hostname = new URL(url, siteUrl).hostname;
          dominios.add(hostname);
        } catch (_) {}
      }
    });

    // Também adiciona o domínio base
    const base = new URL(siteUrl).hostname;
    dominios.add(base);

    return Array.from(dominios);
  } catch (err) {
    console.error('Erro ao acessar o site:', err.message);
    return [];
  }
}

async function testarSNI(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: 5000
    }, () => {
      resolve({ hostname, status: '✔ VÁLIDO' });
      socket.end();
    });

    socket.on('error', () => resolve({ hostname, status: '✘ INVÁLIDO' }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ hostname, status: '✘ TIMEOUT' });
    });
  });
}

async function obterIPs(hostname) {
  try {
    const resultados = await dns.resolve4(hostname);
    return resultados;
  } catch {
    return [];
  }
}

function calcularRangesCIDR(ips) {
  const subnets = new Set();
  ips.forEach(ipAddr => {
    const range = ip.cidrSubnet(`${ipAddr}/24`).networkAddress + '/24';
    subnets.add(range);
  });
  return Array.from(subnets);
}

async function iniciar() {
  console.log(`🔎 Buscando domínios ligados a: ${site}`);

  const encontrados = await extrairDominios(site);
  console.log(`🌐 ${encontrados.length} domínios encontrados.`);

  const validos = [];

  for (const dominio of encontrados) {
    const resultado = await testarSNI(dominio);
    console.log(`[${resultado.status}] ${resultado.hostname}`);
    if (resultado.status === '✔ VÁLIDO') validos.push(resultado.hostname);
  }

  const ipsUnicos = new Set();
  for (const dominio of validos) {
    const ips = await obterIPs(dominio);
    ips.forEach(ip => ipsUnicos.add(ip));
  }

  const ranges = calcularRangesCIDR(Array.from(ipsUnicos));

  fs.writeFileSync('snis_mpositivas_validos.txt', validos.join('\n'));
  fs.writeFileSync('snis_mpositivas_ips.txt', Array.from(ipsUnicos).join('\n'));
  fs.writeFileSync('snis_mpositivas_ranges.txt', ranges.join('\n'));

  console.log('\n✅ Resultados salvos:');
  console.log('- snis_mpositivas_validos.txt');
  console.log('- snis_mpositivas_ips.txt');
  console.log('- snis_mpositivas_ranges.txt');
}

iniciar();
