import express from 'express';
import axios from 'axios';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// 环境变量配置（全部修改为合法标识符并保持一致性）
const UP_URL = process.env.UP_URL || '';
const P_URL = process.env.P_URL || '';
const AUTO_A = process.env.AUTO_A || false;
const F_PATH = process.env.F_PATH || './tmp';
const S_PATH = process.env.S_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';
const N_SERVER = process.env.N_SERVER || '';
const N_PORT = process.env.N_PORT || '';
const N_KEY = process.env.N_KEY || '';
const ERGOU_DOMAIN = process.env.ERGOU_DOMAIN || '';
const ERGOU_AUTH = process.env.ERGOU_AUTH || '';
const ERGOU_PORT = process.env.ERGOU_PORT || 8001;
const CFIP = process.env.CFIP || 'www.visa.com.sg';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'Vls';

// 创建运行文件夹
if (!fs.existsSync(F_PATH)) {
  fs.mkdirSync(F_PATH, { recursive: true });
  console.log(`${F_PATH} 目录创建成功`);
}

// 定义文件路径
const npmPath = path.join(F_PATH, 'npm');
const phpPath = path.join(F_PATH, 'php');
const webPath = path.join(F_PATH, 'web');
const botPath = path.join(F_PATH, 'bot');
const subPath = path.join(F_PATH, 'sub.txt');
const listPath = path.join(F_PATH, 'list.txt');
const bootLogPath = path.join(F_PATH, 'boot.log');
const configPath = path.join(F_PATH, 'config.json');

// 删除节点
async function deleteNodes() {
  try {
    if (!UP_URL || !fs.existsSync(subPath)) return;
    
    const fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    await axios.post(`${UP_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log('历史节点删除成功');
  } catch (err) {
    console.error('删除节点失败:', err.message);
  }
}

// 清理历史文件
function cleanupOldFiles() {
  const pathsToDelete = ['web', 'bot', 'npm', 'php', 'sub.txt', 'boot.log'];
  pathsToDelete.forEach(file => {
    const filePath = path.join(F_PATH, file);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error(`删除 ${filePath} 失败:`, err.message);
      });
    }
  });
}

// 创建 Express 应用
const app = express();

// 根路由
app.get("/", (req, res) => {
  res.send("服务已启动");
});

// 生成配置文件
const config = {
  log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
  inbounds: [
    { port: ERGOU_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
    { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
    { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [ { protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" } ]
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

// 获取系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  return arch.includes('arm') ? 'arm' : 'amd';
}

// 下载文件（修复流处理问题）
async function downloadFile(fileName, fileUrl) {
  const filePath = path.join(F_PATH, fileName);
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    console.log(`下载 ${fileName} 成功`);
    fs.chmodSync(filePath, 0o755); // 设置可执行权限
  } catch (err) {
    console.error(`下载 ${fileName} 失败:`, err.message);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// 下载并运行依赖
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`不支持当前架构: ${architecture}`);
    return;
  }

  // 并行下载所有文件
  await Promise.all(filesToDownload.map(file => 
    downloadFile(file.fileName, file.fileUrl)
  ));

  // 运行哪吒监控
  if (N_SERVER && N_KEY) {
    const isV1 = !N_PORT;
    
    if (isV1) {
      const port = N_SERVER.includes(':') ? N_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      
      const configYaml = `
client_secret: ${N_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${N_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
      
      fs.writeFileSync(path.join(F_PATH, 'config.yaml'), configYaml);
      
      if (fs.existsSync(phpPath)) {
        const phpProcess = spawn(phpPath, ['-c', `${F_PATH}/config.yaml`], {
          detached: true,
          stdio: 'ignore'
        });
        phpProcess.unref();
        console.log('哪吒监控 (v1) 已启动');
      } else {
        console.error('哪吒监控文件不存在，无法启动');
      }
    } else {
      let N_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(N_PORT)) {
        N_TLS = '--tls';
      }
      
      if (fs.existsSync(npmPath)) {
        const npmProcess = spawn(npmPath, ['-s', `${N_SERVER}:${N_PORT}`, '-p', N_KEY, N_TLS], {
          detached: true,
          stdio: 'ignore'
        });
        npmProcess.unref();
        console.log('哪吒监控 (v0) 已启动');
      } else {
        console.error('哪吒监控文件不存在，无法启动');
      }
    }
  }

  // 运行 web 服务
  if (fs.existsSync(webPath)) {
    const webProcess = spawn(webPath, ['-c', configPath], {
      detached: true,
      stdio: 'ignore'
    });
    webProcess.unref();
    console.log('Web 服务已启动');
  } else {
    console.error('Web 服务文件不存在，无法启动');
  }

  // 运行 cloud-fared
  if (fs.existsSync(botPath)) {
    let args;

    if (ERGOU_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ERGOU_AUTH}`;
    } else if (ERGOU_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${F_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${F_PATH}/boot.log --loglevel info --url http://localhost:${ERGOU_PORT}`;
    }

    const botProcess = spawn(botPath, args.split(' '), {
      detached: true,
      stdio: 'ignore'
    });
    botProcess.unref();
    console.log('Cloudflare Tunnel 已启动');
  } else {
    console.error('Cloudflare Tunnel 文件不存在，无法启动');
  }
}

// 获取文件列表
function getFilesForArchitecture(architecture) {
  const baseFiles = [
    { fileName: "web", fileUrl: `https://${architecture === 'arm' ? 'arm64' : 'amd64'}.ssss.nyc.mn/web` },
    { fileName: "bot", fileUrl: `https://${architecture === 'arm' ? 'arm64' : 'amd64'}.ssss.nyc.mn/2go` }
  ];

  if (N_SERVER && N_KEY) {
    baseFiles.unshift({
      fileName: N_PORT ? "npm" : "php",
      fileUrl: N_PORT 
        ? `https://${architecture === 'arm' ? 'arm64' : 'amd64'}.ssss.nyc.mn/agent` 
        : `https://${architecture === 'arm' ? 'arm64' : 'amd64'}.ssss.nyc.mn/v1`
    });
  }

  return baseFiles;
}

// 配置固定隧道
function argoType() {
  if (!ERGOU_AUTH || !ERGOU_DOMAIN) {
    console.log("ERGOU_DOMAIN 或 ERGOU_AUTH 为空，使用临时隧道");
    return;
  }

  if (ERGOU_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(F_PATH, 'tunnel.json'), ERGOU_AUTH);
    const tunnelYaml = `
tunnel: ${ERGOU_AUTH.split('"')[11]}
credentials-file: ${path.join(F_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ERGOU_DOMAIN}
    service: http://localhost:${ERGOU_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(F_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ERGOU_AUTH 不是有效的 TunnelSecret，使用 token 连接隧道");
  }
}

// 启动应用
async function startApp() {
  try {
    console.log("应用启动中...");
    cleanupOldFiles();
    await deleteNodes();
    await downloadFilesAndRun();
    argoType();
    
    // 启动 Express 服务器
    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
    });
  } catch (error) {
    console.error("应用启动失败:", error);
    process.exit(1);
  }
}

// 执行启动
startApp();
