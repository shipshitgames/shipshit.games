import fs from "node:fs";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";

const GYM_DECLARATION_FILES = ["studio.gyms.json", path.join(".shipshit", "gyms.json")];
const SPAWN_SETTLE_MS = 300;

function slugifyGym(value) {
  return String(value || "gym")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "gym";
}

function titleFromId(id) {
  return String(id || "gym")
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Gym";
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanArgs(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.length > 0) : [];
}

function safeUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeCwd(repoPath, cwd) {
  const repo = path.resolve(repoPath);
  const raw = cleanString(cwd);
  if (!raw) return repo;
  const resolved = path.resolve(repo, raw);
  if (resolved === repo || resolved.startsWith(repo + path.sep)) return resolved;
  return repo;
}

function declarationPathForRepo(repoPath) {
  const repo = path.resolve(repoPath);
  for (const rel of GYM_DECLARATION_FILES) {
    const candidate = path.join(repo, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(repo, GYM_DECLARATION_FILES[0]);
}

function readJson(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, error: `Invalid ${path.basename(file)}: ${error?.message || error}` };
  }
}

function normalizeGym(raw, repoPath, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: `gyms[${index}] must be an object` };
  }

  const script = cleanString(raw.script);
  const command = cleanString(raw.command);
  const args = cleanArgs(raw.args);
  const url = safeUrl(raw.url);
  const source = cleanString(raw.id || raw.name || raw.label || script || command || `gym-${index + 1}`);
  const id = slugifyGym(source);
  const label = cleanString(raw.label || raw.name) || titleFromId(id);
  const cwd = safeCwd(repoPath, raw.cwd);
  const description = cleanString(raw.description);
  const kind = slugifyGym(raw.kind || id);

  if (!script && !command && !url) {
    return { error: `gyms[${index}] must define script, command, or url` };
  }

  return {
    gym: {
      id,
      label,
      kind,
      description,
      script: script || null,
      command: command || null,
      args,
      url: url || null,
      cwd,
    },
  };
}

function readGymDeclaration(repoPath) {
  const declarationPath = declarationPathForRepo(repoPath);
  if (!fs.existsSync(declarationPath)) {
    return { declarationPath, exists: false, gyms: [], error: null };
  }

  const parsed = readJson(declarationPath);
  if (!parsed.ok) {
    return { declarationPath, exists: true, gyms: [], error: parsed.error };
  }

  const list = Array.isArray(parsed.data) ? parsed.data : parsed.data?.gyms;
  if (!Array.isArray(list)) {
    return { declarationPath, exists: true, gyms: [], error: "gym declaration must contain a gyms array" };
  }

  const gyms = [];
  const errors = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const normalized = normalizeGym(list[i], repoPath, i);
    if (normalized.error) {
      errors.push(normalized.error);
      continue;
    }
    const gym = normalized.gym;
    if (seen.has(gym.id)) {
      errors.push(`duplicate gym id "${gym.id}"`);
      continue;
    }
    seen.add(gym.id);
    gyms.push(gym);
  }

  return {
    declarationPath,
    exists: true,
    gyms,
    error: errors.length ? errors.join("; ") : null,
  };
}

function projectSummary(project, activeProjectId) {
  const repoPath = path.resolve(project.repoPath);
  const declaration = readGymDeclaration(repoPath);
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    repoPath,
    exists: fs.existsSync(repoPath),
    isActive: project.id === activeProjectId,
    declarationPath: declaration.declarationPath,
    declarationExists: declaration.exists,
    error: declaration.error,
    gyms: declaration.gyms,
  };
}

function waitForSpawn(child, timeoutMs = SPAWN_SETTLE_MS): Promise<any> {
  if (typeof child?.once !== "function") return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    let done = false;
    let timer: any = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    child.once("spawn", () => finish({ ok: true }));
    child.once("error", (error) => finish({ ok: false, error }));
    timer = setTimeout(() => finish({ ok: true }), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
  });
}

function createGymLauncher(options: any = {}) {
  const projects = () => {
    const raw = typeof options.projects === "function" ? options.projects() : options.projects;
    return Array.isArray(raw) ? raw : [];
  };
  const activeProjectId = () => {
    const raw = typeof options.activeProjectId === "function" ? options.activeProjectId() : options.activeProjectId;
    return typeof raw === "string" ? raw : "";
  };
  const spawn = options.spawn || nodeSpawn;
  const openExternal = options.openExternal || (async () => false);
  const env = options.env || process.env;

  function list() {
    const active = activeProjectId();
    const summaries = projects().map((project) => projectSummary(project, active));
    return {
      projects: summaries,
      activeProjectId: active && summaries.some((project) => project.id === active) ? active : summaries[0]?.id || "",
    };
  }

  async function launch(payload: any = {}) {
    const state = list();
    const projectId = cleanString(payload.projectId) || state.activeProjectId;
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) return { ok: false, error: "Project not found" };
    if (!project.exists) return { ok: false, error: "Project path does not exist", projectId };
    if (project.error && project.gyms.length === 0) return { ok: false, error: project.error, projectId };

    const gymId = slugifyGym(payload.gymId);
    const gym = project.gyms.find((candidate) => candidate.id === gymId);
    if (!gym) return { ok: false, error: "Gym not found", projectId, gymId };

    let processInfo: any = null;
    if (gym.script || gym.command) {
      const command = gym.command || "bun";
      const args = gym.command ? gym.args : ["run", gym.script, ...gym.args];
      try {
        const child = spawn(command, args, {
          cwd: gym.cwd,
          env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" },
          detached: true,
          stdio: "ignore",
        });
        const spawned = await waitForSpawn(child);
        if (!spawned.ok) {
          return { ok: false, error: `Failed to launch ${command}: ${spawned.error?.message || spawned.error}`, projectId, gymId };
        }
        if (typeof child?.unref === "function") child.unref();
        processInfo = { pid: child?.pid ?? null, command, args, cwd: gym.cwd };
      } catch (error) {
        return { ok: false, error: `Failed to launch ${command}: ${error?.message || error}`, projectId, gymId };
      }
    }

    let openedUrl = false;
    if (gym.url) {
      try {
        await openExternal(gym.url);
        openedUrl = true;
      } catch (error) {
        return { ok: false, error: `Failed to open ${gym.url}: ${error?.message || error}`, projectId, gymId };
      }
    }

    return {
      ok: true,
      projectId,
      gymId,
      label: gym.label,
      pid: processInfo?.pid ?? null,
      command: processInfo?.command ?? null,
      args: processInfo?.args ?? [],
      cwd: processInfo?.cwd ?? gym.cwd,
      openedUrl,
      url: gym.url,
    };
  }

  return { list, launch };
}

export {
  GYM_DECLARATION_FILES,
  createGymLauncher,
  declarationPathForRepo,
  normalizeGym,
  readGymDeclaration,
  slugifyGym,
};
