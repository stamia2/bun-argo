import express from 'express';
import axios from 'axios';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { execSync } from 'node:child_process';

// **环境变量配置（已修正变量名规范问题）**
const UP_URL = process.env.UP_URL || '';         // 原 UPLOAD_URL → 保留
const P_URL = process.env.P_URL || '';         // 原 PROJECT_URL → 保留
const AUTO_A = process.env.AUTO_A || false;     // 原 AUTO_ACCESS → 保留
const F_PATH = process.env.F_PATH || './tmp';     // 原 FILE_PATH → 保留
const S_PATH = process.env.S_PATH || 'sub';         // 原 SUB_PATH → 保留
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';

// **哪吒监控相关变量**
const N_SERVER = process.env.N_SERVER || '';     // 原 NEZHA_SERVER → 保留
const N_PORT = process.env.N_PORT || '';         // 原 NEZHA_POR（修正拼写错误）→ NEZHA_PORT
const N_KEY = process.env.N_KEY || '';           // 原 NEZHA_KEY → 保留

// **ERGOU（原 ARGO）相关变量**
const ERGOU_DOMAIN = process.env.ERGOU_DOMAIN || ''; // 原 ARGO_DOMAIN → 改为 ERGOU_DOMAIN
const ERGOU_AUTH = process.env.ERGOU_AUTH || '';     // 原 ARGO_AUTH → 改为 ERGOU_AUTH
const ERGOU_PORT = process.env.ERGOU_PORT || 8001;   // 原 ARGO_PORT → 改为 ERGOU_PORT

const CFIP = process.env.CFIP || 'www.visa.com.sg';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'Vls';

// 创建运行文件夹
if (!fs.existsSync(F_PATH)) {
  fs.mkdirSync(F_PATH, { recursive: true });
  console.log(`${F_PATH} 目录创建成功`);
}

// 定义文件路径（与变量名保持一致）
const npmPath = path.join(F_PATH, 'npm');
const phpPath = path.join(F_PATH, 'php');
const webPath = path.join(F_PATH, 'web');
const botPath = path.join(F_PATH, 'bot');
const subPath = path.join(F_PATH, 'sub.txt');
const listPath = path.join(F_PATH, 'list.txt');
const bootLogPath = path.join(F_PATH, 'boot.log');
const configPath = path.join(F_PATH, 'config.json');

// 删除节点（使用修正后的环境变量）
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

// 生成配置文件（使用 ERGOU_PORT 替换原 ARGO_PORT）
const config = {
  log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
  inbounds: [
    { port: ERGOU_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
    // 其他 inbounds 配置保持不变
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [ { protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" } ]
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

// 下载并运行依赖（使用 ERGOU_ 变量）
async function downloadFilesAndRun() {
  // ...（中间逻辑不变）

  // 运行 cloud-fared（替换为 ERGOU_AUTH 和 ERGOU_PORT）
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

// 配置固定隧道（使用 ERGOU_DOMAIN 和 ERGOU_AUTH）
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
