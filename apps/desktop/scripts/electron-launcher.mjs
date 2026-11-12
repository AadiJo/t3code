import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const desktopDir = NodePath.resolve(__dirname, "..");
const repoRoot = NodePath.resolve(desktopDir, "..", "..");

export function resolveLocalAppBundleId({ development, repoName }) {
  const suffix = repoName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "") || "local";
  return `com.t3tools.t3code.${development ? "dev" : "local"}.${suffix}`;
}

const APP_DISPLAY_NAME = isDevelopment ? "T3 Code (Dev)" : "T3 Code";
export const APP_BUNDLE_ID = resolveLocalAppBundleId({
  development: isDevelopment,
  repoName: NodePath.basename(repoRoot),
});
const APP_PROTOCOL_SCHEMES = isDevelopment ? ["t3code-dev"] : ["t3code"];
const LAUNCHER_VERSION = 20;
const developmentMacIconPngPath = NodePath.join(
  repoRoot,
  "assets",
  "dev",
  "blueprint-macos-1024.png",
);
const productionMacIconPngPath = NodePath.join(repoRoot, "assets", "prod", "black-macos-1024.png");
const developmentMacIconComposerPath = NodePath.join(repoRoot, "assets", "dev", "app-icon.icon");
const productionMacIconComposerPath = NodePath.join(repoRoot, "assets", "prod", "app-icon.icon");
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone launcher script has no Effect runtime.
const hostPlatform = NodeOS.platform();

function setPlistString(plistPath, key, value) {
  const replaceResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-replace", key, "-string", value, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-insert", key, "-string", value, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
}

function setPlistJson(plistPath, key, value) {
  const serialized = JSON.stringify(value);
  const replaceResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-replace", key, "-json", serialized, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-insert", key, "-json", serialized, plistPath],
    {
      encoding: "utf8",
    },
  );
  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
}

function runChecked(command, args) {
  const result = NodeChildProcess.spawnSync(command, args, { encoding: "utf8" });
  if (result.status === 0) {
    return;
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
  throw new Error(`Failed to run ${command} ${args.join(" ")}: ${details}`.trim());
}

function removePlistKey(plistPath, key) {
  NodeChildProcess.spawnSync("plutil", ["-remove", key, plistPath], {
    encoding: "utf8",
  });
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function makeDevelopmentEnvironmentScript(environment) {
  const envEntries = [
    ["VITE_DEV_SERVER_URL", environment.VITE_DEV_SERVER_URL],
    ["T3CODE_PORT", environment.T3CODE_PORT],
    ["T3CODE_HOME", environment.T3CODE_HOME],
    ["T3CODE_COMMIT_HASH", environment.T3CODE_COMMIT_HASH],
    ["T3CODE_OTLP_TRACES_URL", environment.T3CODE_OTLP_TRACES_URL],
    ["T3CODE_OTLP_EXPORT_INTERVAL_MS", environment.T3CODE_OTLP_EXPORT_INTERVAL_MS],
    ["T3CODE_OTLP_HEADERS", environment.T3CODE_OTLP_HEADERS],
    ["T3CODE_OTLP_PROTOCOL", environment.T3CODE_OTLP_PROTOCOL],
    ["T3CODE_DESKTOP_APP_USER_MODEL_ID", APP_BUNDLE_ID],
  ].filter((entry) => typeof entry[1] === "string" && entry[1].trim().length > 0);
  return [
    ...envEntries.map(
      ([name, value]) =>
        `if [ -z "\${${name}:-}" ]; then export ${name}=${shellSingleQuote(value)}; fi`,
    ),
    "",
  ].join("\n");
}

export function makeDevelopmentLauncherScript({
  electronBinaryPath,
  mainEntryPath,
  desktopRoot,
  environmentFilePath,
}) {
  return [
    "#!/bin/sh",
    `if [ -f ${shellSingleQuote(environmentFilePath)} ]; then . ${shellSingleQuote(environmentFilePath)}; fi`,
    `exec ${shellSingleQuote(electronBinaryPath)} --t3code-dev-root=${shellSingleQuote(desktopRoot)} ${shellSingleQuote(mainEntryPath)} "$@"`,
    "",
  ].join("\n");
}

const developmentEnvironmentFilePath = NodePath.join(
  desktopDir,
  ".electron-runtime",
  "dev-environment.sh",
);

function writeDevelopmentEnvironmentScript() {
  NodeFS.mkdirSync(NodePath.dirname(developmentEnvironmentFilePath), { recursive: true });
  NodeFS.writeFileSync(
    developmentEnvironmentFilePath,
    makeDevelopmentEnvironmentScript(process.env),
  );
}

export function writeDevelopmentLauncherScript(targetBinaryPath, electronBinaryPath) {
  const script = makeDevelopmentLauncherScript({
    electronBinaryPath,
    mainEntryPath: NodePath.join(desktopDir, "dist-electron", "main.cjs"),
    desktopRoot: desktopDir,
    environmentFilePath: developmentEnvironmentFilePath,
  });
  if (
    NodeFS.existsSync(targetBinaryPath) &&
    NodeFS.readFileSync(targetBinaryPath, "utf8") === script
  ) {
    NodeFS.chmodSync(targetBinaryPath, 0o755);
    return false;
  }
  NodeFS.writeFileSync(targetBinaryPath, script);
  NodeFS.chmodSync(targetBinaryPath, 0o755);
  return true;
}

function registerMacLauncherBundle(appBundlePath) {
  runChecked(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appBundlePath],
  );

  if (!isDevelopment) {
    return;
  }

  for (const scheme of APP_PROTOCOL_SCHEMES) {
    runChecked("osascript", [
      "-l",
      "JavaScript",
      "-e",
      [
        'ObjC.import("CoreServices");',
        `const scheme = $.NSString.alloc.initWithUTF8String(${JSON.stringify(scheme)});`,
        `const bundle = $.NSString.alloc.initWithUTF8String(${JSON.stringify(APP_BUNDLE_ID)});`,
        "const status = $.LSSetDefaultHandlerForURLScheme(scheme, bundle);",
        "if (status !== 0) throw new Error(`LSSetDefaultHandlerForURLScheme failed: ${status}`);",
      ].join(" "),
    ]);
  }
}

// Bundle-internal paths are macOS paths whatever host builds them.
function resolveMacLauncherIconPaths(runtimeDir, development = isDevelopment) {
  return {
    sourceIconPath: development ? developmentMacIconPngPath : productionMacIconPngPath,
    generatedIconPath: NodePath.posix.join(
      runtimeDir,
      development ? "icon-dev.icns" : "icon-prod.icns",
    ),
  };
}

export function resolveMacLauncherIconComposerPath(development = isDevelopment) {
  return development ? developmentMacIconComposerPath : productionMacIconComposerPath;
}

function ensureMacIconIcns(runtimeDir, development = isDevelopment) {
  const { sourceIconPath, generatedIconPath } = resolveMacLauncherIconPaths(
    runtimeDir,
    development,
  );
  NodeFS.mkdirSync(runtimeDir, { recursive: true });

  if (!NodeFS.existsSync(sourceIconPath)) {
    throw new Error(`Desktop macOS icon source is missing at ${sourceIconPath}`);
  }

  const sourceMtimeMs = NodeFS.statSync(sourceIconPath).mtimeMs;
  if (
    NodeFS.existsSync(generatedIconPath) &&
    NodeFS.statSync(generatedIconPath).mtimeMs >= sourceMtimeMs
  ) {
    return generatedIconPath;
  }

  const iconsetRoot = NodeFS.mkdtempSync(NodePath.join(runtimeDir, "dev-iconset-"));
  const iconsetDir = NodePath.join(iconsetRoot, "icon.iconset");
  NodeFS.mkdirSync(iconsetDir, { recursive: true });

  try {
    for (const size of [16, 32, 128, 256, 512]) {
      runChecked("sips", [
        "-z",
        String(size),
        String(size),
        sourceIconPath,
        "--out",
        NodePath.join(iconsetDir, `icon_${size}x${size}.png`),
      ]);

      const retinaSize = size * 2;
      runChecked("sips", [
        "-z",
        String(retinaSize),
        String(retinaSize),
        sourceIconPath,
        "--out",
        NodePath.join(iconsetDir, `icon_${size}x${size}@2x.png`),
      ]);
    }

    runChecked("iconutil", ["-c", "icns", iconsetDir, "-o", generatedIconPath]);
    return generatedIconPath;
  } finally {
    NodeFS.rmSync(iconsetRoot, { recursive: true, force: true });
  }
}

function resolveMacBundleInfoPlistStrings(executableName) {
  return {
    CFBundleDisplayName: APP_DISPLAY_NAME,
    CFBundleName: APP_DISPLAY_NAME,
    CFBundleIdentifier: APP_BUNDLE_ID,
    CFBundleExecutable: executableName,
    CFBundleIconFile: "icon.icns",
    NSScreenCaptureUsageDescription:
      "T3 Code captures the active window when you use the snapshot shortcut.",
    NSDocumentsFolderUsageDescription: "T3 Code reads project files you open in the desktop app.",
  };
}

function findLatestMtimeMs(path) {
  const stat = NodeFS.statSync(path);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  return Math.max(
    stat.mtimeMs,
    ...NodeFS.readdirSync(path, { withFileTypes: true }).map((entry) =>
      findLatestMtimeMs(NodePath.join(path, entry.name)),
    ),
  );
}

function ensureMacIconAssets(runtimeDir, development = isDevelopment) {
  const mode = development ? "dev" : "prod";
  const iconComposerPath = resolveMacLauncherIconComposerPath(development);
  const fallback = () => ({
    assetCatalogPath: null,
    iconPath: ensureMacIconIcns(runtimeDir, development),
  });

  if (!NodeFS.existsSync(iconComposerPath)) {
    return fallback();
  }

  const assetCatalogPath = NodePath.join(runtimeDir, `Assets-${mode}.car`);
  const iconPath = NodePath.join(runtimeDir, `icon-${mode}-composer.icns`);
  const sourceMtimeMs = findLatestMtimeMs(iconComposerPath);
  if (
    NodeFS.existsSync(assetCatalogPath) &&
    NodeFS.existsSync(iconPath) &&
    NodeFS.statSync(assetCatalogPath).mtimeMs >= sourceMtimeMs &&
    NodeFS.statSync(iconPath).mtimeMs >= sourceMtimeMs
  ) {
    return { assetCatalogPath, iconPath };
  }

  const compileRoot = NodeFS.mkdtempSync(NodePath.join(runtimeDir, "icon-composer-"));
  const inputPath = NodePath.join(compileRoot, "Icon.icon");
  const outputPath = NodePath.join(compileRoot, "out");
  NodeFS.cpSync(iconComposerPath, inputPath, { recursive: true });
  NodeFS.mkdirSync(outputPath, { recursive: true });

  try {
    runChecked("xcrun", [
      "actool",
      inputPath,
      "--compile",
      outputPath,
      "--output-format",
      "human-readable-text",
      "--notices",
      "--warnings",
      "--output-partial-info-plist",
      NodePath.join(outputPath, "assetcatalog_generated_info.plist"),
      "--app-icon",
      "Icon",
      "--include-all-app-icons",
      "--accent-color",
      "AccentColor",
      "--enable-on-demand-resources",
      "NO",
      "--development-region",
      "en",
      "--target-device",
      "mac",
      "--minimum-deployment-target",
      "26.0",
      "--platform",
      "macosx",
    ]);
    NodeFS.copyFileSync(NodePath.join(outputPath, "Assets.car"), assetCatalogPath);
    NodeFS.copyFileSync(NodePath.join(outputPath, "Icon.icns"), iconPath);
    return { assetCatalogPath, iconPath };
  } catch (error) {
    console.warn(
      "[desktop-launcher] Failed to compile the local Icon Composer project, falling back to ICNS.",
      error,
    );
    return fallback();
  } finally {
    NodeFS.rmSync(compileRoot, { recursive: true, force: true });
  }
}

function patchMainBundleInfoPlist(appBundlePath, iconAssets, executableName) {
  const infoPlistPath = NodePath.join(appBundlePath, "Contents", "Info.plist");
  for (const [key, value] of Object.entries(resolveMacBundleInfoPlistStrings(executableName))) {
    setPlistString(infoPlistPath, key, value);
  }
  if (iconAssets.assetCatalogPath) {
    setPlistString(infoPlistPath, "CFBundleIconName", "Icon");
  } else {
    removePlistKey(infoPlistPath, "CFBundleIconName");
  }
  // macOS 26 offers Messages/Mail codes in every text field unless opted out.
  setPlistJson(infoPlistPath, "NSAutoFillRequiresTextContentTypeForOneTimeCodeOnMac", true);
  setPlistJson(infoPlistPath, "CFBundleURLTypes", [
    {
      CFBundleURLName: APP_BUNDLE_ID,
      CFBundleURLSchemes: APP_PROTOCOL_SCHEMES,
    },
  ]);

  const resourcesDir = NodePath.join(appBundlePath, "Contents", "Resources");
  const bundledAssetCatalogPath = NodePath.join(resourcesDir, "Assets.car");
  NodeFS.copyFileSync(iconAssets.iconPath, NodePath.join(resourcesDir, "icon.icns"));
  NodeFS.copyFileSync(iconAssets.iconPath, NodePath.join(resourcesDir, "electron.icns"));
  if (iconAssets.assetCatalogPath) {
    NodeFS.copyFileSync(iconAssets.assetCatalogPath, bundledAssetCatalogPath);
  } else {
    NodeFS.rmSync(bundledAssetCatalogPath, { force: true });
  }
}

function patchHelperBundleInfoPlists(appBundlePath) {
  const helperBundleNames = [
    ["Electron Helper.app", "helper", `${APP_DISPLAY_NAME} Helper`],
    ["Electron Helper (GPU).app", "helper.gpu", `${APP_DISPLAY_NAME} Helper (GPU)`],
    ["Electron Helper (Plugin).app", "helper.plugin", `${APP_DISPLAY_NAME} Helper (Plugin)`],
    ["Electron Helper (Renderer).app", "helper.renderer", `${APP_DISPLAY_NAME} Helper (Renderer)`],
  ];

  for (const [bundleName, bundleIdentifierSuffix, bundleDisplayName] of helperBundleNames) {
    const infoPlistPath = NodePath.join(
      appBundlePath,
      "Contents",
      "Frameworks",
      bundleName,
      "Contents",
      "Info.plist",
    );
    if (!NodeFS.existsSync(infoPlistPath)) {
      continue;
    }

    setPlistString(infoPlistPath, "CFBundleDisplayName", bundleDisplayName);
    setPlistString(infoPlistPath, "CFBundleName", bundleDisplayName);
    setPlistString(
      infoPlistPath,
      "CFBundleIdentifier",
      `${APP_BUNDLE_ID}.${bundleIdentifierSuffix}`,
    );
  }
}

export function resolveMacLauncherSigningArgs(appBundlePath) {
  return ["--force", "--sign", "-", appBundlePath];
}

function signMacLauncherBundle(appBundlePath) {
  // Bundle metadata and icons are part of the signature, so re-sign the patched bundle and macOS
  // ties notifications to it, not to Electron or another T3 Code build. No --deep: Electron's
  // versioned frameworks are both framework roots and app bundles, so recursion is ambiguous.
  runChecked("codesign", resolveMacLauncherSigningArgs(appBundlePath));
}

function readJson(path) {
  try {
    return JSON.parse(NodeFS.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function resolveMacLauncherPaths(appBundlePath, displayName = APP_DISPLAY_NAME) {
  const executableDir = NodePath.posix.join(appBundlePath, "Contents", "MacOS");
  const launcherExecutableName = `${displayName} Launcher`;
  return {
    launcherExecutableName,
    launcherBinaryPath: NodePath.posix.join(executableDir, launcherExecutableName),
    runtimeElectronBinaryPath: NodePath.posix.join(executableDir, "Electron"),
  };
}

function buildMacLauncher(electronBinaryPath) {
  const sourceAppBundlePath = NodePath.resolve(NodePath.dirname(electronBinaryPath), "../..");
  const runtimeDir = NodePath.join(desktopDir, ".electron-runtime");
  const targetAppBundlePath = NodePath.join(runtimeDir, `${APP_DISPLAY_NAME}.app`);
  const developmentPaths = resolveMacLauncherPaths(targetAppBundlePath);
  const runtimeElectronBinaryPath = developmentPaths.runtimeElectronBinaryPath;
  const launcherBinaryPath = isDevelopment
    ? developmentPaths.launcherBinaryPath
    : runtimeElectronBinaryPath;
  NodeFS.mkdirSync(runtimeDir, { recursive: true });
  const iconAssets = ensureMacIconAssets(runtimeDir);
  const metadataPath = NodePath.join(runtimeDir, "metadata.json");

  const expectedMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    sourceAppBundlePath,
    sourceAppMtimeMs: NodeFS.statSync(sourceAppBundlePath).mtimeMs,
    iconMtimeMs: NodeFS.statSync(iconAssets.iconPath).mtimeMs,
    assetCatalogMtimeMs: iconAssets.assetCatalogPath
      ? NodeFS.statSync(iconAssets.assetCatalogPath).mtimeMs
      : null,
    appBundleId: APP_BUNDLE_ID,
    appProtocolSchemes: APP_PROTOCOL_SCHEMES,
  };

  const currentMetadata = readJson(metadataPath);
  if (
    NodeFS.existsSync(launcherBinaryPath) &&
    (!isDevelopment || NodeFS.existsSync(runtimeElectronBinaryPath)) &&
    currentMetadata &&
    JSON.stringify(currentMetadata) === JSON.stringify(expectedMetadata)
  ) {
    if (isDevelopment) {
      // Protocol activations bypass the dev runner, so refresh the fallback environment on every launch.
      writeDevelopmentEnvironmentScript();
      if (writeDevelopmentLauncherScript(launcherBinaryPath, runtimeElectronBinaryPath)) {
        signMacLauncherBundle(targetAppBundlePath);
      }
    }
    registerMacLauncherBundle(targetAppBundlePath);
    return launcherBinaryPath;
  }

  NodeFS.rmSync(targetAppBundlePath, { recursive: true, force: true });
  // Without verbatimSymlinks, cpSync makes framework symlinks point outside the bundle and crashes helpers.
  NodeFS.cpSync(sourceAppBundlePath, targetAppBundlePath, {
    recursive: true,
    verbatimSymlinks: true,
  });
  patchMainBundleInfoPlist(
    targetAppBundlePath,
    iconAssets,
    isDevelopment ? developmentPaths.launcherExecutableName : "Electron",
  );
  patchHelperBundleInfoPlists(targetAppBundlePath);
  if (isDevelopment) {
    // Electron.app's executable name keeps default-app mode active without making app.isPackaged true.
    writeDevelopmentEnvironmentScript();
    writeDevelopmentLauncherScript(launcherBinaryPath, runtimeElectronBinaryPath);
  }
  signMacLauncherBundle(targetAppBundlePath);
  NodeFS.writeFileSync(metadataPath, `${JSON.stringify(expectedMetadata, null, 2)}\n`);
  registerMacLauncherBundle(targetAppBundlePath);

  return launcherBinaryPath;
}

function isLinuxSetuidSandboxConfigured(electronBinaryPath) {
  if (hostPlatform !== "linux") {
    return true;
  }

  const sandboxPath = NodePath.join(NodePath.dirname(electronBinaryPath), "chrome-sandbox");
  try {
    const sandboxStat = NodeFS.statSync(sandboxPath);
    return sandboxStat.uid === 0 && (sandboxStat.mode & 0o4777) === 0o4755;
  } catch {
    return false;
  }
}

function resolveLinuxSandboxArgs(electronBinaryPath) {
  if (isLinuxSetuidSandboxConfigured(electronBinaryPath)) {
    return [];
  }

  console.warn(
    "[desktop-launcher] Electron chrome-sandbox is not root-owned with mode 4755; launching local Electron with --no-sandbox.",
  );
  return ["--no-sandbox"];
}

function resolveElectronPath() {
  const electronBinaryPath = resolveElectronBinaryPath();

  if (hostPlatform !== "darwin") {
    return electronBinaryPath;
  }

  return buildMacLauncher(electronBinaryPath);
}

export function resolveElectronLaunchCommand(args = []) {
  const electronPath = resolveElectronPath();
  return {
    electronPath,
    args: [...resolveLinuxSandboxArgs(electronPath), ...args],
  };
}

export function resolveElectronBinaryPath({
  ensureRuntime = ensureElectronRuntime,
  createRequire = NodeModule.createRequire,
  moduleUrl = import.meta.url,
} = {}) {
  ensureRuntime();

  const require = createRequire(moduleUrl);
  return require("electron");
}

export function resolveDevProtocolClient() {
  if (hostPlatform !== "darwin" || !isDevelopment) {
    return null;
  }

  const electronBinaryPath = resolveElectronBinaryPath();
  const launcherBinaryPath = buildMacLauncher(electronBinaryPath);
  return {
    appBundlePath: NodePath.resolve(launcherBinaryPath, "..", "..", ".."),
    appBundleId: APP_BUNDLE_ID,
  };
}
