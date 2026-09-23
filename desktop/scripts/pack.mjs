#!/usr/bin/env node
/**
 * pack.mjs —— 「打包桌面版.bat」的真正实现
 *
 * 为什么逻辑不写在 .bat 里？
 * ------------------------------------------------------------------
 * cmd.exe 的批处理解析器**无法可靠处理含大量多字节字符的 .bat 文件**。
 * 它按字节偏移重新定位文件，多字节字符会让偏移逐渐错位，
 * 最终把某一行切在半个字符中间 —— 于是 `echo 中文` 被拆成
 * 「不是内部或外部命令」的乱码。
 *
 * 实测（同一份内容，CMD /D /C 直接跑）：
 *   纯 ASCII + CRLF，5733 字节      -> 69/69 行正常，stderr 全空
 *   UTF-8 无 BOM + CRLF，8318 字节  -> 只有 19/69 行，大量乱码命令
 *   GBK + CRLF，5845 字节           -> 正常，但会和 Node 的 UTF-8 输出冲突
 *   UTF-8 + BOM                     -> BOM 被当成命令名
 *   用 ASCII 外层先 chcp 65001 再 call 内层 -> 仍然 19/69，无效
 *
 * 结论：**.bat 必须是纯 ASCII**，所有中文提示一律由 Node 打印
 * （Node 写的是 UTF-8 字节，配合 .bat 里那句 `chcp 65001` 就能正常显示）。
 *
 * 用法（通常由 打包桌面版.bat 调用）：
 *   node scripts/pack.mjs             # 完整流程
 *   node scripts/pack.mjs --no-pause  # 结束后不再等待按键
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PRODUCT, ROOT } from './project.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 本项目只需 Tauri CLI 一个 npm 依赖（前端是现成静态文件，无构建链）。
// 原模板的 TSC / VITE 常量已移除。
const CLI = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

/** 递归找出目录里最新的文件修改时间（毫秒）。用于前端资源的时效性提示。 */
function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          newest = Math.max(newest, fs.statSync(p).mtimeMs);
        } catch {
          /* 跳过读不到的条目 */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

const line = (n = 52) => '  ' + '='.repeat(n);
const say = (...a) => console.log(...a);
const step = (n, total, title) => {
  say('');
  say(`  [${n}/${total}] ${title}...`);
  say('');
};

function die(title, details = []) {
  say('');
  say(line());
  say(`  ${title}`);
  say(line());
  for (const d of details) say('  ' + d);
  say('');
  process.exit(1);
}

/** 跑一条命令，输出实时转发到当前终端，同时收集文本 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['inherit', 'pipe', 'pipe'],
      ...opts,
    });
    let out = '';
    p.stdout.on('data', (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    p.stderr.on('data', (d) => {
      out += d.toString();
      process.stderr.write(d);
    });
    p.on('error', (e) => resolve({ code: -1, out: out + '\n' + e.message }));
    p.on('close', (code) => resolve({ code, out }));
  });
}

/** 读一行输入（没有 TTY 时直接返回空串，避免卡住） */
function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const TOTAL = 5;

  // 控制台窗口标题由 Node 设置 —— .bat 里不能写中文，所以 title 命令也搬过来了。
  // OSC 序列：ESC ] 0 ; <标题> BEL
  process.stdout.write(`\x1b]0;${PRODUCT} - 打包\x07`);

  say('');
  say(line());
  say(`    ${PRODUCT} · 打包成 Windows 安装包`);
  say(line());

  /* ---------------- [1/5] 环境自检 ---------------- */
  step(1, TOTAL, '检查构建环境');
  const envCheck = path.join(__dirname, 'env-check.mjs');
  const env = await run(process.execPath, [envCheck]);
  if (env.code !== 0) {
    die('环境检查未通过，请按上方提示补齐依赖后再试。');
  }

  /* ---------------- [2/5] 项目文件 ---------------- */
  step(2, TOTAL, '检查项目文件');

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    say('  首次运行，正在安装 Tauri CLI...');
    const r = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install']);
    if (r.code !== 0) die('依赖安装失败。', ['请检查网络后重试。']);
  }

  // Tauri CLI 是唯一的 npm 依赖 —— 缺了它后面几步都跑不动。
  const cliPath = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (!fs.existsSync(cliPath)) {
    die('找不到 Tauri CLI', [
      `期望位置：${cliPath}`,
      '',
      '请在 desktop/ 目录下运行：  npm install',
    ]);
  }

  if (!fs.existsSync(path.join(ROOT, 'src-tauri', 'icons', 'icon.ico'))) {
    say('  缺少应用图标，正在生成...');
    const r = await run(process.execPath, [path.join(__dirname, 'gen-icons.mjs')]);
    if (r.code !== 0) die('图标生成失败。');
  }

  // GNU 工具链配置：src-tauri/.cargo/config.toml
  //
  // 这个文件由 setup-gnu.mjs 生成，内容是**本机 MinGW 的绝对路径**，
  // 所以模板仓库里没有它（有了反而会把别人的路径带给你）。
  // 但缺了它会同时坏掉两件事：
  //   1. 编译目标退化成 rustup 的默认 toolchain。默认若是 msvc，
  //      得先白编译十几分钟，才会在链接阶段报 could not open 'kernel32.lib'；
  //   2. -Wl,-exclude-all-symbols 不生效，可能撞上 export ordinal too large。
  // 与其让人等十几分钟再看不懂的报错，不如在这里补上。
  //
  // 想走 MSVC 路线（需要管理员权限）就设 WEB2EXE_NO_GNU=1 跳过这段。
  const cargoCfg = path.join(ROOT, 'src-tauri', '.cargo', 'config.toml');
  const hasGnuCfg =
    fs.existsSync(cargoCfg) &&
    fs.readFileSync(cargoCfg, 'utf8').includes('x86_64-pc-windows-gnu');

  if (hasGnuCfg) {
    say('  GNU 工具链配置：[OK] src-tauri\\.cargo\\config.toml');
  } else if (process.env.WEB2EXE_NO_GNU) {
    say('  [跳过] 未配置 GNU 工具链（WEB2EXE_NO_GNU=1，按 MSVC 路线处理）');
  } else {
    say('  未配置 GNU 工具链，正在生成 src-tauri\\.cargo\\config.toml ...');
    const r = await run(process.execPath, [path.join(__dirname, 'setup-gnu.mjs')]);
    if (r.code !== 0 || !fs.existsSync(cargoCfg)) {
      die('GNU 工具链未就绪', [
        '这一步需要 MinGW-w64 —— 不用 Visual Studio 就靠它。',
        '',
        '  1. 双击「安装MinGW环境.bat」，按提示下载 MSYS2 并安装 gcc',
        '  2. 装完重新运行本脚本（也可以手动执行 node scripts/setup-gnu.mjs）',
        '',
        '若你本来就想走 MSVC 路线（需要管理员权限、约 2-4 GB），',
        '请先装好 Visual Studio「使用 C++ 的桌面开发」，然后设 WEB2EXE_NO_GNU=1 再打包。',
      ]);
    }
  }

  // ---- 更新签名：私钥 + 公钥，两样都要对 ----
  //
  // 本项目当前 **关闭了自动更新**（tauri.conf.json 的
  // bundle.createUpdaterArtifacts = false），所以不生成、也不检查签名密钥。
  // 壳只负责显示面板，版本分发直接换安装包即可。
  //
  // 若将来要启用自动更新：
  //   1. 把 createUpdaterArtifacts 改回 true，并在 tauri.conf.json 里配好
  //      plugins.updater.pubkey 与 endpoints
  //   2. 生成一对密钥（会询问密码，直接回车用空密码）：
  //        node node_modules/@tauri-apps/cli/tauri.js signer generate -w .tauri-key
  //   3. 私钥 .tauri-key 绝不能提交到仓库，且务必单独备份
  //      —— 丢了就再也无法给已安装的用户推送更新
  //   4. 把下面这段检查逻辑从模板原版恢复（见 git 历史或 web2exe-tauri 仓库）
  const updaterEnabled = (() => {
    try {
      const p = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
      return JSON.parse(fs.readFileSync(p, 'utf8')).bundle?.createUpdaterArtifacts === true;
    } catch {
      return false;
    }
  })();

  if (updaterEnabled) {
    say('  自动更新：已启用，但本脚本未做密钥检查。');
    say('  请确认 .tauri-key 已存在、且 tauri.conf.json 的 pubkey 已填好。');
  } else {
    say('  自动更新：未启用（createUpdaterArtifacts = false），跳过签名密钥检查。');
  }

  // 版本号统一从 tauri.conf.json 读，避免多处维护导致不一致
  let version = '';
  try {
    version = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    ).version;
  } catch {
    /* 下面统一报错 */
  }
  if (!version) {
    die('无法从 src-tauri/tauri.conf.json 读取版本号。');
  }
  say(`  版本号：${version}`);

  /* ---------------- [3/5] 前端资源 ---------------- */
  //
  // 本项目与 web2exe 模板的差异：**前端是现成的静态文件，没有构建步骤**。
  // tauri.conf.json 的 build.frontendDist 直接指向 ../../public（仓库里已有的
  // index.html / app.js / style.css），所以这里只做「存在性 + 时效性」检查，
  // 不调 tsc / vite。原模板的构建逻辑保留在下方注释里备查。
  step(3, TOTAL, '检查前端资源');

  const confPathForDist = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
  let frontendDist = '';
  try {
    const dist = JSON.parse(fs.readFileSync(confPathForDist, 'utf8')).build?.frontendDist;
    frontendDist = path.resolve(path.join(ROOT, 'src-tauri'), dist || '');
  } catch {
    /* 下面统一报错 */
  }

  if (!frontendDist || !fs.existsSync(frontendDist)) {
    die('前端资源目录不存在', [
      `tauri.conf.json 的 build.frontendDist 指向：${frontendDist || '(未配置)'}`,
      '',
      '这个项目的前端源码位于仓库根的 public/，正常情况下应指向 ../../public。',
      '若你把它移走了，改回正确路径再打包。',
    ]);
  }

  const distIndex = path.join(frontendDist, 'index.html');
  if (!fs.existsSync(distIndex)) {
    die(`前端目录里没有 index.html：${distIndex}`, [
      'Tauri 需要一个入口页面。请确认 public/index.html 存在。',
    ]);
  }

  const newestSrc = newestMtime(frontendDist);
  const indexTime = fs.statSync(distIndex).mtimeMs;
  say(`  前端目录：[OK] ${path.relative(ROOT, frontendDist)}`);
  say(`  入口页面：[OK] index.html`);
  say(
    `  资源最新修改：${new Date(newestSrc).toLocaleString('zh-CN')}` +
      (newestSrc > indexTime ? '（比 index.html 新，属正常：同级资源文件）' : ''),
  );

  /* ---------------- [4/5] 编译并打包 ---------------- */
  step(4, TOTAL, '编译并打包（首次约 5-15 分钟，下面是实时输出）');

  // build-desktop.mjs 内部会：补 PATH、同步 WebView2Loader.dll、
  // 用正确的方式设置签名密码、并把 Tauri 的 beforeBuildCommand 置空
  // （前端刚在第 3 步构建过，不必再构建一遍）。
  const build = await run(process.execPath, [path.join(__dirname, 'build-desktop.mjs')]);
  if (build.code !== 0) {
    die('打包失败', [
      '',
      '若报错包含 "export ordinal too large" / "too many exported symbols"：',
      '  这是 GNU 工具链的符号溢出（MinGW 默认导出全部静态库符号，',
      '  而 Windows PE 限制导出序号 <= 65535）。',
      '  正常情况由 src-tauri\\.cargo\\config.toml 里的',
      '    -C link-arg=-Wl,-exclude-all-symbols',
      '  解决 —— GNU ld 2.4x 原生支持该参数，不需要额外安装 LLD。',
      '  若仍报此错，说明配置丢了，重新运行  npm run setup:gnu',
      '',
      '若报错包含 "could not open \'kernel32.lib\'"：',
      '  这是走了 MSVC 路线但缺少 Windows SDK，建议改用 GNU 路线。',
      '',
      '若报错是下载超时（Connection Failed / os error 10060）：',
      '  NSIS 打包器首次使用需要下载，请配置网络代理后重试。',
      '',
      '若报错包含 "failed to decode pubkey"：',
      '  tauri.conf.json 里 plugins.updater.pubkey 不是有效的公钥（多半还是占位符）。',
      '  正常情况第 [2/5] 步已经自动填好了；手动改过的话，把它改回占位符再打一次。',
    ]);
  }

  /* ---------------- [5/5] 生成更新清单 ---------------- */
  step(5, TOTAL, '生成更新清单');
  say('  请填入安装包的线上地址前缀');
  say('  （应用会从这里下载更新，必须是 HTTPS）');
  say('');
  const baseUrl = await ask('  地址前缀: ');

  if (!baseUrl) {
    say('');
    say('  未填地址，跳过生成 update.json。');
    say('  稍后可以手动运行：');
    say(`    node scripts/gen-update-json.mjs ${version} https://你的地址/目录`);
  } else {
    const r = await run(process.execPath, [
      path.join(__dirname, 'gen-update-json.mjs'),
      version,
      baseUrl,
    ]);
    if (r.code !== 0) {
      say('');
      say('  [警告] update.json 生成失败，安装包本身已经打好了。');
    }
  }

  /* ---------------- 完成 ---------------- */
  say('');
  say(line());
  say('  打包完成');
  say(line());
  say('');
  say('  产物位置（由脚本自动探测 —— GNU 工具链下路径含 target triple，');
  say('  不是简单的 target\\release）：');
  say('');
  await run(process.execPath, [path.join(__dirname, 'build-status.mjs')]);
  say('');
  say('  产物说明：');
  say('    *-setup.exe        安装包，双击即可安装');
  say('    *-setup.exe.sig    更新签名，必须跟安装包一起上传');
  say('    update.json        更新清单，放在线上目录供应用查询');
  say('');
  say('  分发步骤：');
  say('    1. 把安装包、.sig 签名、update.json 传到同一个线上目录');
  say('    2. 该目录地址要与 src-tauri\\tauri.conf.json 里');
  say('       plugins.updater.endpoints 的配置一致');
  say('    3. 发布新版本时，改高 tauri.conf.json 的 version 再打一次包');
  say('');
}

main().catch((e) => {
  console.error('');
  console.error('  [x] 未预期的错误：' + (e?.stack ?? e));
  process.exit(1);
});
