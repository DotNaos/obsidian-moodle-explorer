"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SchoolDownloadPanelPlugin
});
module.exports = __toCommonJS(main_exports);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_child_process2 = require("node:child_process");
var import_node_util2 = require("node:util");
var import_obsidian3 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  moodleBinary: ""
};
var SchoolDownloadPanelSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "School Download Panel" });
    new import_obsidian.Setting(containerEl).setName("Moodle binary").setDesc("Optional. Leave empty to auto-try /Users/oli/go/bin/moodle first and then moodle from PATH.").addText(
      (text) => text.setPlaceholder("/Users/oli/go/bin/moodle").setValue(this.plugin.settings.moodleBinary).onChange(async (value) => {
        this.plugin.settings.moodleBinary = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/download-view.ts
var import_obsidian2 = require("obsidian");
var VIEW_TYPE_SCHOOL_DOWNLOAD = "school-download-panel-view";
var SchoolDownloadPanelView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.semesters = [];
    this.expanded = /* @__PURE__ */ new Set();
    this.courseFiles = /* @__PURE__ */ new Map();
    this.loadingCourses = /* @__PURE__ */ new Set();
    this.resourceStates = /* @__PURE__ */ new Map();
    this.loadingSemesters = false;
    this.refreshingLogin = false;
    this.loadError = "";
  }
  getViewType() {
    return VIEW_TYPE_SCHOOL_DOWNLOAD;
  }
  getDisplayText() {
    return "School Downloads";
  }
  getIcon() {
    return "folder-down";
  }
  async onOpen() {
    this.containerEl.addClass("school-download-panel-view");
    await this.reloadSemesters();
  }
  async reloadSemesters() {
    this.loadingSemesters = true;
    this.loadError = "";
    this.render();
    try {
      this.semesters = await this.plugin.loadSemesters();
      this.courseFiles.clear();
      for (const semester of this.semesters) {
        for (const course of semester.courses) {
          const cached = this.plugin.getCachedCourseFiles(course);
          if (cached?.length) {
            this.courseFiles.set(course.key, cached);
          }
        }
      }
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loadingSemesters = false;
      this.render();
    }
  }
  async ensureCourseFiles(course) {
    const cached = this.plugin.getCachedCourseFiles(course);
    if (cached?.length) {
      this.courseFiles.set(course.key, cached);
      this.render();
    }
    if (this.loadingCourses.has(course.key)) {
      return;
    }
    this.loadingCourses.add(course.key);
    if (!cached?.length) {
      this.render();
    }
    try {
      const fresh = await this.plugin.loadCourseFiles(course);
      this.courseFiles.set(course.key, fresh);
      await this.plugin.updateCachedCourseFiles(course, fresh);
      this.resourceStates.delete(`course-error:${course.key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!cached?.length) {
        new import_obsidian2.Notice(`Dateiliste konnte nicht geladen werden: ${message}`);
      }
      this.resourceStates.set(`course-error:${course.key}`, { status: "error", message });
    } finally {
      this.loadingCourses.delete(course.key);
      this.render();
    }
  }
  toggle(key) {
    if (this.expanded.has(key)) {
      this.expanded.delete(key);
    } else {
      this.expanded.add(key);
    }
    this.render();
  }
  async download(course, resource) {
    const stateKey = `${course.key}:${resource.id}`;
    this.resourceStates.set(stateKey, { status: "loading" });
    this.render();
    try {
      const result = await this.plugin.downloadResource(course, resource);
      const saved = result.savedFiles[0] || await this.plugin.findDownloadedResource(course, resource);
      if (!saved) {
        throw new Error("Die Datei wurde heruntergeladen, aber lokal nicht gefunden.");
      }
      resource.downloadedPath = saved;
      this.resourceStates.delete(stateKey);
      await this.plugin.openAbsolutePath(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.resourceStates.set(stateKey, { status: "error", message });
      new import_obsidian2.Notice(`Download fehlgeschlagen: ${message}`);
    }
    this.render();
  }
  async openOrDownload(course, resource) {
    const stateKey = `${course.key}:${resource.id}`;
    const state = this.resourceStates.get(stateKey);
    if (state?.status === "loading") {
      return;
    }
    if (resource.downloadedPath) {
      try {
        await this.plugin.openAbsolutePath(resource.downloadedPath);
        return;
      } catch {
        resource.downloadedPath = await this.plugin.findDownloadedResource(course, resource);
        if (resource.downloadedPath) {
          await this.plugin.openAbsolutePath(resource.downloadedPath);
          return;
        }
      }
    }
    await this.download(course, resource);
  }
  async refreshLogin() {
    if (this.refreshingLogin) {
      return;
    }
    this.refreshingLogin = true;
    this.render();
    try {
      await this.plugin.refreshMoodleLogin();
      new import_obsidian2.Notice("Moodle Login erneuert.");
      await this.reloadSemesters();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian2.Notice(`Login erneuern fehlgeschlagen: ${message}`);
    } finally {
      this.refreshingLogin = false;
      this.render();
    }
  }
  render() {
    const container = this.contentEl;
    container.empty();
    const toolbar = container.createDiv({ cls: "school-download-panel-toolbar" });
    const toolbarText = toolbar.createDiv({ cls: "school-download-panel-toolbar-text" });
    toolbarText.setText("Moodle Dateien");
    new import_obsidian2.Setting(toolbar).addButton(
      (button) => button.setButtonText(this.refreshingLogin ? "Login..." : "Login erneuern").setDisabled(this.refreshingLogin).onClick(() => {
        void this.refreshLogin();
      })
    ).addButton(
      (button) => button.setButtonText("Neu laden").setCta().onClick(() => {
        void this.reloadSemesters();
      })
    );
    const tree = container.createDiv({ cls: "school-download-panel-tree" });
    if (this.loadingSemesters) {
      tree.createDiv({ cls: "school-download-panel-empty", text: "Lade Semester..." });
      return;
    }
    if (this.loadError) {
      tree.createDiv({ cls: "school-download-panel-error", text: this.loadError });
      return;
    }
    if (!this.semesters.length) {
      tree.createDiv({ cls: "school-download-panel-empty", text: "Keine Semester mit moodle-course.json gefunden." });
      return;
    }
    for (const semester of this.semesters) {
      const semesterNode = tree.createDiv({ cls: "school-download-panel-node" });
      this.renderFolderRow(semesterNode, semester.key, semester.name, "semester");
      if (!this.expanded.has(semester.key)) {
        continue;
      }
      const semesterChildren = semesterNode.createDiv({ cls: "school-download-panel-children" });
      for (const course of semester.courses) {
        const courseNode = semesterChildren.createDiv({ cls: "school-download-panel-node" });
        const courseLabel = course.title;
        this.renderFolderRow(courseNode, course.key, courseLabel, "course", async () => {
          await this.ensureCourseFiles(course);
        });
        if (!this.expanded.has(course.key)) {
          continue;
        }
        const courseChildren = courseNode.createDiv({ cls: "school-download-panel-children" });
        if (this.loadingCourses.has(course.key) && !this.courseFiles.has(course.key)) {
          courseChildren.createDiv({ cls: "school-download-panel-empty", text: "Lade Dateiliste..." });
          continue;
        }
        const courseError = this.resourceStates.get(`course-error:${course.key}`);
        if (courseError?.status === "error") {
          courseChildren.createDiv({ cls: "school-download-panel-error", text: courseError.message });
          continue;
        }
        for (const section of this.courseFiles.get(course.key) || []) {
          const sectionNode = courseChildren.createDiv({ cls: "school-download-panel-node" });
          this.renderFolderRow(sectionNode, section.key, section.name, "section");
          if (!this.expanded.has(section.key)) {
            continue;
          }
          const sectionChildren = sectionNode.createDiv({ cls: "school-download-panel-children" });
          for (const resource of section.resources) {
            this.renderResourceRow(sectionChildren, course, resource);
          }
        }
      }
    }
  }
  renderFolderRow(parent, key, label, kind, onExpand) {
    const row = parent.createDiv({ cls: "school-download-panel-row" });
    row.dataset.kind = kind;
    const expanded = this.expanded.has(key);
    const toggle = row.createDiv({ cls: "school-download-panel-toggle" });
    (0, import_obsidian2.setIcon)(toggle, expanded ? "chevron-down" : "chevron-right");
    const itemIcon = row.createDiv({ cls: "school-download-panel-item-icon" });
    (0, import_obsidian2.setIcon)(itemIcon, expanded ? "folder-open" : "folder");
    row.addEventListener("click", () => {
      this.toggle(key);
      if (!expanded && onExpand) {
        void onExpand();
      }
    });
    const labelEl = row.createDiv({ cls: "school-download-panel-label" });
    labelEl.createDiv({ cls: "school-download-panel-name", text: label });
  }
  renderResourceRow(parent, course, resource) {
    const stateKey = `${course.key}:${resource.id}`;
    const state = this.resourceStates.get(stateKey);
    const row = parent.createDiv({ cls: "school-download-panel-row" });
    row.dataset.kind = "resource";
    if (!resource.downloadedPath && state?.status !== "loading") {
      row.addClass("is-remote");
    }
    if (state?.status === "loading") {
      row.addClass("is-busy");
    }
    const spacer = row.createDiv({ cls: "school-download-panel-toggle is-leaf" });
    const itemIcon = row.createDiv({ cls: "school-download-panel-item-icon" });
    (0, import_obsidian2.setIcon)(itemIcon, this.resourceIconName(resource, state));
    if (state?.status === "loading") {
      itemIcon.addClass("is-spinning");
    }
    const label = row.createDiv({ cls: "school-download-panel-label" });
    label.createDiv({ cls: "school-download-panel-name", text: resource.name });
    row.addEventListener("click", () => {
      void this.openOrDownload(course, resource);
    });
    if (state?.status === "error" && state.message) {
      parent.createDiv({ cls: "school-download-panel-status", text: state.message });
    }
  }
  resourceIconName(resource, state) {
    if (state?.status === "loading") {
      return "loader-circle";
    }
    if (resource.downloadedPath) {
      return "file";
    }
    return "cloud-download";
  }
};

// src/school-data.ts
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var execFile = (0, import_node_util.promisify)(import_node_child_process.execFile);
function slugifySection(name) {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "misc";
}
function getPreferredMoodleBinary(preferred) {
  if (preferred.trim()) return preferred.trim();
  return "/Users/oli/go/bin/moodle";
}
async function listSemesters(rootPath) {
  const entries = await import_promises.default.readdir(rootPath, { withFileTypes: true });
  const semesters = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const semesterPath = import_node_path.default.join(rootPath, entry.name);
    const courses = await listCoursesInSemester(semesterPath, entry.name);
    if (courses.length) {
      semesters.push({
        key: `semester:${entry.name}`,
        name: entry.name,
        path: semesterPath,
        courses
      });
    }
  }
  return semesters.sort((left, right) => right.name.localeCompare(left.name));
}
async function listCoursesInSemester(semesterPath, termName) {
  const entries = await import_promises.default.readdir(semesterPath, { withFileTypes: true });
  const courses = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const courseDir = import_node_path.default.join(semesterPath, entry.name);
    const snapshotPath = import_node_path.default.join(courseDir, "moodle-course.json");
    if (!await exists(snapshotPath)) {
      continue;
    }
    const snapshot = await readJsonFile(snapshotPath);
    const courseId = String(snapshot.courseId || "").trim();
    if (!courseId) {
      continue;
    }
    courses.push({
      key: `course:${termName}:${entry.name}`,
      slug: entry.name,
      title: (snapshot.title || await readCourseTitle(courseDir) || entry.name).trim(),
      courseId,
      courseDir,
      snapshotPath,
      termName
    });
  }
  return courses.sort((left, right) => left.title.localeCompare(right.title));
}
async function readCourseTitle(courseDir) {
  const readmePath = import_node_path.default.join(courseDir, "README.md");
  if (!await exists(readmePath)) {
    return "";
  }
  const text = await import_promises.default.readFile(readmePath, "utf8");
  const line = text.split("\n").find((entry) => entry.startsWith("# "));
  return line ? line.slice(2).trim() : "";
}
async function listCourseFiles(moodleBinary, course) {
  const output = await runMoodleJson(moodleBinary, ["list", "files", course.courseId, "--json"]);
  const resources = await Promise.all(
    output.filter((item) => item.type === "resource").map(async (item) => {
      const resource = {
        ...item,
        courseId: String(item.courseId || course.courseId),
        sectionId: String(item.sectionId || ""),
        sectionName: String(item.sectionName || "misc"),
        fileType: String(item.fileType || ""),
        uploadedAt: item.uploadedAt ? String(item.uploadedAt) : null,
        url: item.url ? String(item.url) : null,
        downloadedPath: null
      };
      resource.downloadedPath = await findDownloadedFile(course, resource);
      return resource;
    })
  );
  const groups = /* @__PURE__ */ new Map();
  for (const resource of resources) {
    const name = resource.sectionName || "misc";
    const key = `section:${course.courseId}:${name}`;
    const current = groups.get(key) || { key, name, resources: [] };
    current.resources.push(resource);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    resources: group.resources.sort(compareResources)
  })).sort((left, right) => left.name.localeCompare(right.name));
}
async function downloadCourseFile(moodleBinary, course, resource) {
  const outputDir = import_node_path.default.join(course.courseDir, "materials", slugifySection(resource.sectionName || "misc"));
  await import_promises.default.mkdir(outputDir, { recursive: true });
  const before = await snapshotDirectory(outputDir);
  const { stdout } = await execFile(moodleBinary, ["download", "file", course.courseId, resource.id, "--output-dir", outputDir], {
    maxBuffer: 20 * 1024 * 1024
  });
  const after = await snapshotDirectory(outputDir);
  const savedFiles = detectSavedFiles(outputDir, before, after);
  return {
    outputDir,
    savedFiles,
    stdout: stdout.trim()
  };
}
async function findDownloadedFile(course, resource) {
  const outputDir = import_node_path.default.join(course.courseDir, "materials", slugifySection(resource.sectionName || "misc"));
  if (!await exists(outputDir)) {
    return null;
  }
  const entries = await import_promises.default.readdir(outputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  if (!files.length) {
    return null;
  }
  const exactName = resource.fileType ? `${resource.name}.${resource.fileType}` : resource.name;
  const exactMatch = files.find((name) => name === exactName);
  if (exactMatch) {
    return import_node_path.default.join(outputDir, exactMatch);
  }
  const normalizedTarget = normalizeName(resource.name);
  const basenameMatch = files.find((name) => normalizeName(import_node_path.default.parse(name).name) === normalizedTarget);
  if (basenameMatch) {
    return import_node_path.default.join(outputDir, basenameMatch);
  }
  return null;
}
async function runMoodleJson(moodleBinary, args) {
  const { stdout, stderr } = await execFile(moodleBinary, args, { maxBuffer: 20 * 1024 * 1024 });
  if (stderr.trim()) {
    const lower = stderr.toLowerCase();
    if (lower.includes("not found") || lower.includes("command not found")) {
      throw new Error(`Moodle binary not usable: ${moodleBinary}`);
    }
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Moodle JSON output: ${message}`);
  }
}
async function readJsonFile(filePath) {
  return JSON.parse(await import_promises.default.readFile(filePath, "utf8"));
}
async function exists(filePath) {
  try {
    await import_promises.default.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function snapshotDirectory(dirPath) {
  const snapshot = /* @__PURE__ */ new Map();
  const entries = await import_promises.default.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = import_node_path.default.join(dirPath, entry.name);
    const stat = await import_promises.default.stat(filePath);
    snapshot.set(entry.name, { size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return snapshot;
}
function detectSavedFiles(outputDir, before, after) {
  const changed = [...after.entries()].filter(([name, current]) => {
    const previous = before.get(name);
    return !previous || previous.mtimeMs !== current.mtimeMs || previous.size !== current.size;
  }).map(([name]) => import_node_path.default.join(outputDir, name));
  if (changed.length) {
    return changed.sort();
  }
  const fallback = [...after.entries()].sort((left, right) => right[1].mtimeMs - left[1].mtimeMs).map(([name]) => import_node_path.default.join(outputDir, name));
  return fallback.slice(0, 1);
}
function compareResources(left, right) {
  if (left.uploadedAt && right.uploadedAt && left.uploadedAt !== right.uploadedAt) {
    return right.uploadedAt.localeCompare(left.uploadedAt);
  }
  return left.name.localeCompare(right.name);
}
function normalizeName(value) {
  return value.normalize("NFKC").trim().toLowerCase();
}

// src/main.ts
var execFile2 = (0, import_node_util2.promisify)(import_node_child_process2.execFile);
var SchoolDownloadPanelPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.courseFileCache = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    this.registerView(
      VIEW_TYPE_SCHOOL_DOWNLOAD,
      (leaf) => new SchoolDownloadPanelView(leaf, this)
    );
    this.addRibbonIcon("folder-down", "Open school download panel", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-school-download-panel",
      name: "Open school download panel",
      callback: () => {
        void this.activateView();
      }
    });
    this.addSettingTab(new SchoolDownloadPanelSettingTab(this));
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCHOOL_DOWNLOAD);
  }
  async loadSettings() {
    const raw = await this.loadData() || null;
    const legacySettings = raw && !("settings" in raw) ? raw : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...legacySettings,
      ...raw?.settings || {}
    };
    this.courseFileCache = new Map(Object.entries(raw?.courseFileCache || {}));
  }
  async saveSettings() {
    await this.savePluginData();
  }
  getVaultRoot() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian3.FileSystemAdapter)) {
      throw new Error("Dieses Plugin funktioniert nur mit einem lokalen Desktop-Vault.");
    }
    return adapter.getBasePath();
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SCHOOL_DOWNLOAD)[0];
    const leaf = existing || this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_SCHOOL_DOWNLOAD, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async loadSemesters() {
    return listSemesters(this.getVaultRoot());
  }
  async loadCourseFiles(course) {
    const sections = await listCourseFiles(this.getMoodleBinary(), course);
    this.courseFileCache.set(course.key, sections);
    await this.savePluginData();
    return sections;
  }
  async downloadResource(course, resource) {
    return downloadCourseFile(this.getMoodleBinary(), course, resource);
  }
  async findDownloadedResource(course, resource) {
    return findDownloadedFile(course, resource);
  }
  getCachedCourseFiles(course) {
    return this.courseFileCache.get(course.key) || null;
  }
  async updateCachedCourseFiles(course, sections) {
    this.courseFileCache.set(course.key, sections);
    await this.savePluginData();
  }
  getMoodleBinary() {
    return getPreferredMoodleBinary(this.settings.moodleBinary);
  }
  toVaultRelative(absolutePath) {
    return import_node_path2.default.relative(this.getVaultRoot(), absolutePath) || ".";
  }
  slugifySection(name) {
    return slugifySection(name);
  }
  async openAbsolutePath(absolutePath) {
    const relativePath = this.toVaultRelative(absolutePath);
    const file = await this.waitForVaultFile(relativePath);
    if (!(file instanceof import_obsidian3.TFile)) {
      throw new Error(`Datei nicht im Vault gefunden: ${relativePath}`);
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file, { active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async refreshMoodleLogin() {
    const quotedBinary = shellQuote(this.getMoodleBinary());
    const command = `set -a; [ -f ~/.env ] && source ~/.env; set +a; ${quotedBinary} login`;
    const { stdout, stderr } = await execFile2("/bin/zsh", ["-lc", command], {
      cwd: this.getVaultRoot(),
      maxBuffer: 20 * 1024 * 1024
    });
    return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
  }
  async savePluginData() {
    const payload = {
      settings: this.settings,
      courseFileCache: Object.fromEntries(this.courseFileCache.entries())
    };
    await this.saveData(payload);
  }
  async waitForVaultFile(relativePath) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const file = this.app.vault.getAbstractFileByPath(relativePath);
      if (file instanceof import_obsidian3.TFile) {
        return file;
      }
      const existsOnDisk = await this.app.vault.adapter.exists(relativePath);
      if (!existsOnDisk) {
        break;
      }
      await sleep(120);
    }
    return this.app.vault.getAbstractFileByPath(relativePath);
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9kb3dubG9hZC12aWV3LnRzIiwgInNyYy9zY2hvb2wtZGF0YS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHsgZXhlY0ZpbGUgYXMgZXhlY0ZpbGVDYWxsYmFjayB9IGZyb20gXCJub2RlOmNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gXCJub2RlOnV0aWxcIjtcbmltcG9ydCB7IEZpbGVTeXN0ZW1BZGFwdGVyLCBQbHVnaW4sIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBTY2hvb2xEb3dubG9hZFBhbmVsU2V0dGluZ1RhYiwgREVGQVVMVF9TRVRUSU5HUywgdHlwZSBTY2hvb2xEb3dubG9hZFBhbmVsU2V0dGluZ3MgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgVklFV19UWVBFX1NDSE9PTF9ET1dOTE9BRCwgU2Nob29sRG93bmxvYWRQYW5lbFZpZXcgfSBmcm9tIFwiLi9kb3dubG9hZC12aWV3XCI7XG5pbXBvcnQgeyBkb3dubG9hZENvdXJzZUZpbGUsIGZpbmREb3dubG9hZGVkRmlsZSwgZ2V0UHJlZmVycmVkTW9vZGxlQmluYXJ5LCBsaXN0Q291cnNlRmlsZXMsIGxpc3RTZW1lc3RlcnMsIHNsdWdpZnlTZWN0aW9uIH0gZnJvbSBcIi4vc2Nob29sLWRhdGFcIjtcbmltcG9ydCB0eXBlIHsgQ291cnNlSW5mbywgTW9vZGxlUmVzb3VyY2UsIFNlY3Rpb25Hcm91cCB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmNvbnN0IGV4ZWNGaWxlID0gcHJvbWlzaWZ5KGV4ZWNGaWxlQ2FsbGJhY2spO1xuXG50eXBlIFBlcnNpc3RlZFBsdWdpbkRhdGEgPSB7XG4gIHNldHRpbmdzPzogUGFydGlhbDxTY2hvb2xEb3dubG9hZFBhbmVsU2V0dGluZ3M+O1xuICBjb3Vyc2VGaWxlQ2FjaGU/OiBSZWNvcmQ8c3RyaW5nLCBTZWN0aW9uR3JvdXBbXT47XG4gIG1vb2RsZUJpbmFyeT86IHN0cmluZztcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaG9vbERvd25sb2FkUGFuZWxQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogU2Nob29sRG93bmxvYWRQYW5lbFNldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgcHJpdmF0ZSBjb3Vyc2VGaWxlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgU2VjdGlvbkdyb3VwW10+KCk7XG5cbiAgb3ZlcnJpZGUgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhcbiAgICAgIFZJRVdfVFlQRV9TQ0hPT0xfRE9XTkxPQUQsXG4gICAgICAobGVhZikgPT4gbmV3IFNjaG9vbERvd25sb2FkUGFuZWxWaWV3KGxlYWYsIHRoaXMpLFxuICAgICk7XG5cbiAgICB0aGlzLmFkZFJpYmJvbkljb24oXCJmb2xkZXItZG93blwiLCBcIk9wZW4gc2Nob29sIGRvd25sb2FkIHBhbmVsXCIsICgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5hY3RpdmF0ZVZpZXcoKTtcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLXNjaG9vbC1kb3dubG9hZC1wYW5lbFwiLFxuICAgICAgbmFtZTogXCJPcGVuIHNjaG9vbCBkb3dubG9hZCBwYW5lbFwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgdm9pZCB0aGlzLmFjdGl2YXRlVmlldygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU2Nob29sRG93bmxvYWRQYW5lbFNldHRpbmdUYWIodGhpcykpO1xuICB9XG5cbiAgb3ZlcnJpZGUgYXN5bmMgb251bmxvYWQoKSB7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLmRldGFjaExlYXZlc09mVHlwZShWSUVXX1RZUEVfU0NIT09MX0RPV05MT0FEKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICBjb25zdCByYXcgPSAoKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgYXMgUGVyc2lzdGVkUGx1Z2luRGF0YSB8IG51bGwpIHx8IG51bGw7XG4gICAgY29uc3QgbGVnYWN5U2V0dGluZ3MgPSByYXcgJiYgIShcInNldHRpbmdzXCIgaW4gcmF3KSA/IChyYXcgYXMgUGFydGlhbDxTY2hvb2xEb3dubG9hZFBhbmVsU2V0dGluZ3M+KSA6IHt9O1xuICAgIHRoaXMuc2V0dGluZ3MgPSB7XG4gICAgICAuLi5ERUZBVUxUX1NFVFRJTkdTLFxuICAgICAgLi4ubGVnYWN5U2V0dGluZ3MsXG4gICAgICAuLi4ocmF3Py5zZXR0aW5ncyB8fCB7fSksXG4gICAgfTtcbiAgICB0aGlzLmNvdXJzZUZpbGVDYWNoZSA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMocmF3Py5jb3Vyc2VGaWxlQ2FjaGUgfHwge30pKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5EYXRhKCk7XG4gIH1cblxuICBnZXRWYXVsdFJvb3QoKSB7XG4gICAgY29uc3QgYWRhcHRlciA9IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXI7XG4gICAgaWYgKCEoYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGllc2VzIFBsdWdpbiBmdW5rdGlvbmllcnQgbnVyIG1pdCBlaW5lbSBsb2thbGVuIERlc2t0b3AtVmF1bHQuXCIpO1xuICAgIH1cbiAgICByZXR1cm4gYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuICB9XG5cbiAgYXN5bmMgYWN0aXZhdGVWaWV3KCkge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfU0NIT09MX0RPV05MT0FEKVswXTtcbiAgICBjb25zdCBsZWFmID0gZXhpc3RpbmcgfHwgdGhpcy5hcHAud29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSk7XG4gICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBWSUVXX1RZUEVfU0NIT09MX0RPV05MT0FELCBhY3RpdmU6IHRydWUgfSk7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLnJldmVhbExlYWYobGVhZik7XG4gIH1cblxuICBhc3luYyBsb2FkU2VtZXN0ZXJzKCkge1xuICAgIHJldHVybiBsaXN0U2VtZXN0ZXJzKHRoaXMuZ2V0VmF1bHRSb290KCkpO1xuICB9XG5cbiAgYXN5bmMgbG9hZENvdXJzZUZpbGVzKGNvdXJzZTogQ291cnNlSW5mbykge1xuICAgIGNvbnN0IHNlY3Rpb25zID0gYXdhaXQgbGlzdENvdXJzZUZpbGVzKHRoaXMuZ2V0TW9vZGxlQmluYXJ5KCksIGNvdXJzZSk7XG4gICAgdGhpcy5jb3Vyc2VGaWxlQ2FjaGUuc2V0KGNvdXJzZS5rZXksIHNlY3Rpb25zKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5EYXRhKCk7XG4gICAgcmV0dXJuIHNlY3Rpb25zO1xuICB9XG5cbiAgYXN5bmMgZG93bmxvYWRSZXNvdXJjZShjb3Vyc2U6IENvdXJzZUluZm8sIHJlc291cmNlOiBNb29kbGVSZXNvdXJjZSkge1xuICAgIHJldHVybiBkb3dubG9hZENvdXJzZUZpbGUodGhpcy5nZXRNb29kbGVCaW5hcnkoKSwgY291cnNlLCByZXNvdXJjZSk7XG4gIH1cblxuICBhc3luYyBmaW5kRG93bmxvYWRlZFJlc291cmNlKGNvdXJzZTogQ291cnNlSW5mbywgcmVzb3VyY2U6IE1vb2RsZVJlc291cmNlKSB7XG4gICAgcmV0dXJuIGZpbmREb3dubG9hZGVkRmlsZShjb3Vyc2UsIHJlc291cmNlKTtcbiAgfVxuXG4gIGdldENhY2hlZENvdXJzZUZpbGVzKGNvdXJzZTogQ291cnNlSW5mbykge1xuICAgIHJldHVybiB0aGlzLmNvdXJzZUZpbGVDYWNoZS5nZXQoY291cnNlLmtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUNhY2hlZENvdXJzZUZpbGVzKGNvdXJzZTogQ291cnNlSW5mbywgc2VjdGlvbnM6IFNlY3Rpb25Hcm91cFtdKSB7XG4gICAgdGhpcy5jb3Vyc2VGaWxlQ2FjaGUuc2V0KGNvdXJzZS5rZXksIHNlY3Rpb25zKTtcbiAgICBhd2FpdCB0aGlzLnNhdmVQbHVnaW5EYXRhKCk7XG4gIH1cblxuICBnZXRNb29kbGVCaW5hcnkoKSB7XG4gICAgcmV0dXJuIGdldFByZWZlcnJlZE1vb2RsZUJpbmFyeSh0aGlzLnNldHRpbmdzLm1vb2RsZUJpbmFyeSk7XG4gIH1cblxuICB0b1ZhdWx0UmVsYXRpdmUoYWJzb2x1dGVQYXRoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGF0aC5yZWxhdGl2ZSh0aGlzLmdldFZhdWx0Um9vdCgpLCBhYnNvbHV0ZVBhdGgpIHx8IFwiLlwiO1xuICB9XG5cbiAgc2x1Z2lmeVNlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHNsdWdpZnlTZWN0aW9uKG5hbWUpO1xuICB9XG5cbiAgYXN5bmMgb3BlbkFic29sdXRlUGF0aChhYnNvbHV0ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHRoaXMudG9WYXVsdFJlbGF0aXZlKGFic29sdXRlUGF0aCk7XG4gICAgY29uc3QgZmlsZSA9IGF3YWl0IHRoaXMud2FpdEZvclZhdWx0RmlsZShyZWxhdGl2ZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRGF0ZWkgbmljaHQgaW0gVmF1bHQgZ2VmdW5kZW46ICR7cmVsYXRpdmVQYXRofWApO1xuICAgIH1cbiAgICBjb25zdCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYodHJ1ZSk7XG4gICAgYXdhaXQgbGVhZi5vcGVuRmlsZShmaWxlLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hNb29kbGVMb2dpbigpIHtcbiAgICBjb25zdCBxdW90ZWRCaW5hcnkgPSBzaGVsbFF1b3RlKHRoaXMuZ2V0TW9vZGxlQmluYXJ5KCkpO1xuICAgIGNvbnN0IGNvbW1hbmQgPSBgc2V0IC1hOyBbIC1mIH4vLmVudiBdICYmIHNvdXJjZSB+Ly5lbnY7IHNldCArYTsgJHtxdW90ZWRCaW5hcnl9IGxvZ2luYDtcbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZShcIi9iaW4venNoXCIsIFtcIi1sY1wiLCBjb21tYW5kXSwge1xuICAgICAgY3dkOiB0aGlzLmdldFZhdWx0Um9vdCgpLFxuICAgICAgbWF4QnVmZmVyOiAyMCAqIDEwMjQgKiAxMDI0LFxuICAgIH0pO1xuICAgIHJldHVybiBbc3Rkb3V0LnRyaW0oKSwgc3RkZXJyLnRyaW0oKV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCJcXG5cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzYXZlUGx1Z2luRGF0YSgpIHtcbiAgICBjb25zdCBwYXlsb2FkOiBQZXJzaXN0ZWRQbHVnaW5EYXRhID0ge1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBjb3Vyc2VGaWxlQ2FjaGU6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLmNvdXJzZUZpbGVDYWNoZS5lbnRyaWVzKCkpLFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YShwYXlsb2FkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd2FpdEZvclZhdWx0RmlsZShyZWxhdGl2ZVBhdGg6IHN0cmluZykge1xuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgMTU7IGF0dGVtcHQgKz0gMSkge1xuICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChyZWxhdGl2ZVBhdGgpO1xuICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICByZXR1cm4gZmlsZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXhpc3RzT25EaXNrID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMocmVsYXRpdmVQYXRoKTtcbiAgICAgIGlmICghZXhpc3RzT25EaXNrKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBzbGVlcCgxMjApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocmVsYXRpdmVQYXRoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzbGVlcChtczogbnVtYmVyKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5mdW5jdGlvbiBzaGVsbFF1b3RlKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIGAnJHt2YWx1ZS5yZXBsYWNlKC8nL2csIGAnXFxcXCcnYCl9J2A7XG59XG4iLCAiaW1wb3J0IHsgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgU2Nob29sRG93bmxvYWRQYW5lbFBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5cbmV4cG9ydCB0eXBlIFNjaG9vbERvd25sb2FkUGFuZWxTZXR0aW5ncyA9IHtcbiAgbW9vZGxlQmluYXJ5OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogU2Nob29sRG93bmxvYWRQYW5lbFNldHRpbmdzID0ge1xuICBtb29kbGVCaW5hcnk6IFwiXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgU2Nob29sRG93bmxvYWRQYW5lbFNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwbHVnaW46IFNjaG9vbERvd25sb2FkUGFuZWxQbHVnaW4pIHtcbiAgICBzdXBlcihwbHVnaW4uYXBwLCBwbHVnaW4pO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJTY2hvb2wgRG93bmxvYWQgUGFuZWxcIiB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJNb29kbGUgYmluYXJ5XCIpXG4gICAgICAuc2V0RGVzYyhcIk9wdGlvbmFsLiBMZWF2ZSBlbXB0eSB0byBhdXRvLXRyeSAvVXNlcnMvb2xpL2dvL2Jpbi9tb29kbGUgZmlyc3QgYW5kIHRoZW4gbW9vZGxlIGZyb20gUEFUSC5cIilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiL1VzZXJzL29saS9nby9iaW4vbW9vZGxlXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1vb2RsZUJpbmFyeSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb29kbGVCaW5hcnkgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KSxcbiAgICAgICk7XG4gIH1cbn1cbiIsICJpbXBvcnQgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgeyBJdGVtVmlldywgTm90aWNlLCBTZXR0aW5nLCBzZXRJY29uLCB0eXBlIFdvcmtzcGFjZUxlYWYgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIFNjaG9vbERvd25sb2FkUGFuZWxQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHR5cGUgeyBDb3Vyc2VJbmZvLCBNb29kbGVSZXNvdXJjZSwgU2VjdGlvbkdyb3VwLCBTZW1lc3RlckluZm8gfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY29uc3QgVklFV19UWVBFX1NDSE9PTF9ET1dOTE9BRCA9IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLXZpZXdcIjtcblxudHlwZSBSZXNvdXJjZVN0YXRlID0ge1xuICBzdGF0dXM6IFwibG9hZGluZ1wiIHwgXCJlcnJvclwiO1xuICBtZXNzYWdlPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGNsYXNzIFNjaG9vbERvd25sb2FkUGFuZWxWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuICBwcml2YXRlIHNlbWVzdGVyczogU2VtZXN0ZXJJbmZvW10gPSBbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBleHBhbmRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGNvdXJzZUZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFNlY3Rpb25Hcm91cFtdPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGxvYWRpbmdDb3Vyc2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VTdGF0ZXMgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VTdGF0ZT4oKTtcbiAgcHJpdmF0ZSBsb2FkaW5nU2VtZXN0ZXJzID0gZmFsc2U7XG4gIHByaXZhdGUgcmVmcmVzaGluZ0xvZ2luID0gZmFsc2U7XG4gIHByaXZhdGUgbG9hZEVycm9yID0gXCJcIjtcblxuICBjb25zdHJ1Y3RvcihsZWFmOiBXb3Jrc3BhY2VMZWFmLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogU2Nob29sRG93bmxvYWRQYW5lbFBsdWdpbikge1xuICAgIHN1cGVyKGxlYWYpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZ2V0Vmlld1R5cGUoKSB7XG4gICAgcmV0dXJuIFZJRVdfVFlQRV9TQ0hPT0xfRE9XTkxPQUQ7XG4gIH1cblxuICBvdmVycmlkZSBnZXREaXNwbGF5VGV4dCgpIHtcbiAgICByZXR1cm4gXCJTY2hvb2wgRG93bmxvYWRzXCI7XG4gIH1cblxuICBvdmVycmlkZSBnZXRJY29uKCkge1xuICAgIHJldHVybiBcImZvbGRlci1kb3duXCI7XG4gIH1cblxuICBvdmVycmlkZSBhc3luYyBvbk9wZW4oKSB7XG4gICAgdGhpcy5jb250YWluZXJFbC5hZGRDbGFzcyhcInNjaG9vbC1kb3dubG9hZC1wYW5lbC12aWV3XCIpO1xuICAgIGF3YWl0IHRoaXMucmVsb2FkU2VtZXN0ZXJzKCk7XG4gIH1cblxuICBhc3luYyByZWxvYWRTZW1lc3RlcnMoKSB7XG4gICAgdGhpcy5sb2FkaW5nU2VtZXN0ZXJzID0gdHJ1ZTtcbiAgICB0aGlzLmxvYWRFcnJvciA9IFwiXCI7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5zZW1lc3RlcnMgPSBhd2FpdCB0aGlzLnBsdWdpbi5sb2FkU2VtZXN0ZXJzKCk7XG4gICAgICB0aGlzLmNvdXJzZUZpbGVzLmNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IHNlbWVzdGVyIG9mIHRoaXMuc2VtZXN0ZXJzKSB7XG4gICAgICAgIGZvciAoY29uc3QgY291cnNlIG9mIHNlbWVzdGVyLmNvdXJzZXMpIHtcbiAgICAgICAgICBjb25zdCBjYWNoZWQgPSB0aGlzLnBsdWdpbi5nZXRDYWNoZWRDb3Vyc2VGaWxlcyhjb3Vyc2UpO1xuICAgICAgICAgIGlmIChjYWNoZWQ/Lmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5jb3Vyc2VGaWxlcy5zZXQoY291cnNlLmtleSwgY2FjaGVkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sb2FkRXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMubG9hZGluZ1NlbWVzdGVycyA9IGZhbHNlO1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBlbnN1cmVDb3Vyc2VGaWxlcyhjb3Vyc2U6IENvdXJzZUluZm8pIHtcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLnBsdWdpbi5nZXRDYWNoZWRDb3Vyc2VGaWxlcyhjb3Vyc2UpO1xuICAgIGlmIChjYWNoZWQ/Lmxlbmd0aCkge1xuICAgICAgdGhpcy5jb3Vyc2VGaWxlcy5zZXQoY291cnNlLmtleSwgY2FjaGVkKTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxvYWRpbmdDb3Vyc2VzLmhhcyhjb3Vyc2Uua2V5KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxvYWRpbmdDb3Vyc2VzLmFkZChjb3Vyc2Uua2V5KTtcbiAgICBpZiAoIWNhY2hlZD8ubGVuZ3RoKSB7XG4gICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgZnJlc2ggPSBhd2FpdCB0aGlzLnBsdWdpbi5sb2FkQ291cnNlRmlsZXMoY291cnNlKTtcbiAgICAgIHRoaXMuY291cnNlRmlsZXMuc2V0KGNvdXJzZS5rZXksIGZyZXNoKTtcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnVwZGF0ZUNhY2hlZENvdXJzZUZpbGVzKGNvdXJzZSwgZnJlc2gpO1xuICAgICAgdGhpcy5yZXNvdXJjZVN0YXRlcy5kZWxldGUoYGNvdXJzZS1lcnJvcjoke2NvdXJzZS5rZXl9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICBpZiAoIWNhY2hlZD8ubGVuZ3RoKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYERhdGVpbGlzdGUga29ubnRlIG5pY2h0IGdlbGFkZW4gd2VyZGVuOiAke21lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc291cmNlU3RhdGVzLnNldChgY291cnNlLWVycm9yOiR7Y291cnNlLmtleX1gLCB7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmxvYWRpbmdDb3Vyc2VzLmRlbGV0ZShjb3Vyc2Uua2V5KTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuICB9XG5cbiAgdG9nZ2xlKGtleTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuZXhwYW5kZWQuaGFzKGtleSkpIHtcbiAgICAgIHRoaXMuZXhwYW5kZWQuZGVsZXRlKGtleSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZXhwYW5kZWQuYWRkKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBhc3luYyBkb3dubG9hZChjb3Vyc2U6IENvdXJzZUluZm8sIHJlc291cmNlOiBNb29kbGVSZXNvdXJjZSkge1xuICAgIGNvbnN0IHN0YXRlS2V5ID0gYCR7Y291cnNlLmtleX06JHtyZXNvdXJjZS5pZH1gO1xuICAgIHRoaXMucmVzb3VyY2VTdGF0ZXMuc2V0KHN0YXRlS2V5LCB7IHN0YXR1czogXCJsb2FkaW5nXCIgfSk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wbHVnaW4uZG93bmxvYWRSZXNvdXJjZShjb3Vyc2UsIHJlc291cmNlKTtcbiAgICAgIGNvbnN0IHNhdmVkID0gcmVzdWx0LnNhdmVkRmlsZXNbMF0gfHwgKGF3YWl0IHRoaXMucGx1Z2luLmZpbmREb3dubG9hZGVkUmVzb3VyY2UoY291cnNlLCByZXNvdXJjZSkpO1xuICAgICAgaWYgKCFzYXZlZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaWUgRGF0ZWkgd3VyZGUgaGVydW50ZXJnZWxhZGVuLCBhYmVyIGxva2FsIG5pY2h0IGdlZnVuZGVuLlwiKTtcbiAgICAgIH1cbiAgICAgIHJlc291cmNlLmRvd25sb2FkZWRQYXRoID0gc2F2ZWQ7XG4gICAgICB0aGlzLnJlc291cmNlU3RhdGVzLmRlbGV0ZShzdGF0ZUtleSk7XG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5vcGVuQWJzb2x1dGVQYXRoKHNhdmVkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICAgIHRoaXMucmVzb3VyY2VTdGF0ZXMuc2V0KHN0YXRlS2V5LCB7IHN0YXR1czogXCJlcnJvclwiLCBtZXNzYWdlIH0pO1xuICAgICAgbmV3IE5vdGljZShgRG93bmxvYWQgZmVobGdlc2NobGFnZW46ICR7bWVzc2FnZX1gKTtcbiAgICB9XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5PckRvd25sb2FkKGNvdXJzZTogQ291cnNlSW5mbywgcmVzb3VyY2U6IE1vb2RsZVJlc291cmNlKSB7XG4gICAgY29uc3Qgc3RhdGVLZXkgPSBgJHtjb3Vyc2Uua2V5fToke3Jlc291cmNlLmlkfWA7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnJlc291cmNlU3RhdGVzLmdldChzdGF0ZUtleSk7XG4gICAgaWYgKHN0YXRlPy5zdGF0dXMgPT09IFwibG9hZGluZ1wiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChyZXNvdXJjZS5kb3dubG9hZGVkUGF0aCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ub3BlbkFic29sdXRlUGF0aChyZXNvdXJjZS5kb3dubG9hZGVkUGF0aCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXNvdXJjZS5kb3dubG9hZGVkUGF0aCA9IGF3YWl0IHRoaXMucGx1Z2luLmZpbmREb3dubG9hZGVkUmVzb3VyY2UoY291cnNlLCByZXNvdXJjZSk7XG4gICAgICAgIGlmIChyZXNvdXJjZS5kb3dubG9hZGVkUGF0aCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm9wZW5BYnNvbHV0ZVBhdGgocmVzb3VyY2UuZG93bmxvYWRlZFBhdGgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCB0aGlzLmRvd25sb2FkKGNvdXJzZSwgcmVzb3VyY2UpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaExvZ2luKCkge1xuICAgIGlmICh0aGlzLnJlZnJlc2hpbmdMb2dpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLnJlZnJlc2hpbmdMb2dpbiA9IHRydWU7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucmVmcmVzaE1vb2RsZUxvZ2luKCk7XG4gICAgICBuZXcgTm90aWNlKFwiTW9vZGxlIExvZ2luIGVybmV1ZXJ0LlwiKTtcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkU2VtZXN0ZXJzKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICBuZXcgTm90aWNlKGBMb2dpbiBlcm5ldWVybiBmZWhsZ2VzY2hsYWdlbjogJHttZXNzYWdlfWApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnJlZnJlc2hpbmdMb2dpbiA9IGZhbHNlO1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG4gIH1cblxuICByZW5kZXIoKSB7XG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250ZW50RWw7XG4gICAgY29udGFpbmVyLmVtcHR5KCk7XG5cbiAgICBjb25zdCB0b29sYmFyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtdG9vbGJhclwiIH0pO1xuICAgIGNvbnN0IHRvb2xiYXJUZXh0ID0gdG9vbGJhci5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLXRvb2xiYXItdGV4dFwiIH0pO1xuICAgIHRvb2xiYXJUZXh0LnNldFRleHQoXCJNb29kbGUgRGF0ZWllblwiKTtcbiAgICBuZXcgU2V0dGluZyh0b29sYmFyKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b25cbiAgICAgICAgICAuc2V0QnV0dG9uVGV4dCh0aGlzLnJlZnJlc2hpbmdMb2dpbiA/IFwiTG9naW4uLi5cIiA6IFwiTG9naW4gZXJuZXVlcm5cIilcbiAgICAgICAgICAuc2V0RGlzYWJsZWQodGhpcy5yZWZyZXNoaW5nTG9naW4pXG4gICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJlZnJlc2hMb2dpbigpO1xuICAgICAgICAgIH0pLFxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIk5ldSBsYWRlblwiKS5zZXRDdGEoKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICB2b2lkIHRoaXMucmVsb2FkU2VtZXN0ZXJzKCk7XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgIGNvbnN0IHRyZWUgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC10cmVlXCIgfSk7XG4gICAgaWYgKHRoaXMubG9hZGluZ1NlbWVzdGVycykge1xuICAgICAgdHJlZS5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLWVtcHR5XCIsIHRleHQ6IFwiTGFkZSBTZW1lc3Rlci4uLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5sb2FkRXJyb3IpIHtcbiAgICAgIHRyZWUuY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC1lcnJvclwiLCB0ZXh0OiB0aGlzLmxvYWRFcnJvciB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCF0aGlzLnNlbWVzdGVycy5sZW5ndGgpIHtcbiAgICAgIHRyZWUuY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC1lbXB0eVwiLCB0ZXh0OiBcIktlaW5lIFNlbWVzdGVyIG1pdCBtb29kbGUtY291cnNlLmpzb24gZ2VmdW5kZW4uXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzZW1lc3RlciBvZiB0aGlzLnNlbWVzdGVycykge1xuICAgICAgY29uc3Qgc2VtZXN0ZXJOb2RlID0gdHJlZS5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLW5vZGVcIiB9KTtcbiAgICAgIHRoaXMucmVuZGVyRm9sZGVyUm93KHNlbWVzdGVyTm9kZSwgc2VtZXN0ZXIua2V5LCBzZW1lc3Rlci5uYW1lLCBcInNlbWVzdGVyXCIpO1xuICAgICAgaWYgKCF0aGlzLmV4cGFuZGVkLmhhcyhzZW1lc3Rlci5rZXkpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3Qgc2VtZXN0ZXJDaGlsZHJlbiA9IHNlbWVzdGVyTm9kZS5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLWNoaWxkcmVuXCIgfSk7XG4gICAgICBmb3IgKGNvbnN0IGNvdXJzZSBvZiBzZW1lc3Rlci5jb3Vyc2VzKSB7XG4gICAgICAgIGNvbnN0IGNvdXJzZU5vZGUgPSBzZW1lc3RlckNoaWxkcmVuLmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtbm9kZVwiIH0pO1xuICAgICAgICBjb25zdCBjb3Vyc2VMYWJlbCA9IGNvdXJzZS50aXRsZTtcbiAgICAgICAgdGhpcy5yZW5kZXJGb2xkZXJSb3coY291cnNlTm9kZSwgY291cnNlLmtleSwgY291cnNlTGFiZWwsIFwiY291cnNlXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmVuc3VyZUNvdXJzZUZpbGVzKGNvdXJzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIXRoaXMuZXhwYW5kZWQuaGFzKGNvdXJzZS5rZXkpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY291cnNlQ2hpbGRyZW4gPSBjb3Vyc2VOb2RlLmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtY2hpbGRyZW5cIiB9KTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGluZ0NvdXJzZXMuaGFzKGNvdXJzZS5rZXkpICYmICF0aGlzLmNvdXJzZUZpbGVzLmhhcyhjb3Vyc2Uua2V5KSkge1xuICAgICAgICAgIGNvdXJzZUNoaWxkcmVuLmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtZW1wdHlcIiwgdGV4dDogXCJMYWRlIERhdGVpbGlzdGUuLi5cIiB9KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb3Vyc2VFcnJvciA9IHRoaXMucmVzb3VyY2VTdGF0ZXMuZ2V0KGBjb3Vyc2UtZXJyb3I6JHtjb3Vyc2Uua2V5fWApO1xuICAgICAgICBpZiAoY291cnNlRXJyb3I/LnN0YXR1cyA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgICAgY291cnNlQ2hpbGRyZW4uY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC1lcnJvclwiLCB0ZXh0OiBjb3Vyc2VFcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLmNvdXJzZUZpbGVzLmdldChjb3Vyc2Uua2V5KSB8fCBbXSkge1xuICAgICAgICAgIGNvbnN0IHNlY3Rpb25Ob2RlID0gY291cnNlQ2hpbGRyZW4uY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC1ub2RlXCIgfSk7XG4gICAgICAgICAgdGhpcy5yZW5kZXJGb2xkZXJSb3coc2VjdGlvbk5vZGUsIHNlY3Rpb24ua2V5LCBzZWN0aW9uLm5hbWUsIFwic2VjdGlvblwiKTtcbiAgICAgICAgICBpZiAoIXRoaXMuZXhwYW5kZWQuaGFzKHNlY3Rpb24ua2V5KSkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHNlY3Rpb25DaGlsZHJlbiA9IHNlY3Rpb25Ob2RlLmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtY2hpbGRyZW5cIiB9KTtcbiAgICAgICAgICBmb3IgKGNvbnN0IHJlc291cmNlIG9mIHNlY3Rpb24ucmVzb3VyY2VzKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclJlc291cmNlUm93KHNlY3Rpb25DaGlsZHJlbiwgY291cnNlLCByZXNvdXJjZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJGb2xkZXJSb3cocGFyZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGtpbmQ6IHN0cmluZywgb25FeHBhbmQ/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG4gICAgY29uc3Qgcm93ID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtcm93XCIgfSk7XG4gICAgcm93LmRhdGFzZXQua2luZCA9IGtpbmQ7XG4gICAgY29uc3QgZXhwYW5kZWQgPSB0aGlzLmV4cGFuZGVkLmhhcyhrZXkpO1xuXG4gICAgY29uc3QgdG9nZ2xlID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtdG9nZ2xlXCIgfSk7XG4gICAgc2V0SWNvbih0b2dnbGUsIGV4cGFuZGVkID8gXCJjaGV2cm9uLWRvd25cIiA6IFwiY2hldnJvbi1yaWdodFwiKTtcblxuICAgIGNvbnN0IGl0ZW1JY29uID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtaXRlbS1pY29uXCIgfSk7XG4gICAgc2V0SWNvbihpdGVtSWNvbiwgZXhwYW5kZWQgPyBcImZvbGRlci1vcGVuXCIgOiBcImZvbGRlclwiKTtcblxuICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgdGhpcy50b2dnbGUoa2V5KTtcbiAgICAgIGlmICghZXhwYW5kZWQgJiYgb25FeHBhbmQpIHtcbiAgICAgICAgdm9pZCBvbkV4cGFuZCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgbGFiZWxFbCA9IHJvdy5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLWxhYmVsXCIgfSk7XG4gICAgbGFiZWxFbC5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLW5hbWVcIiwgdGV4dDogbGFiZWwgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlclJlc291cmNlUm93KHBhcmVudDogSFRNTEVsZW1lbnQsIGNvdXJzZTogQ291cnNlSW5mbywgcmVzb3VyY2U6IE1vb2RsZVJlc291cmNlKSB7XG4gICAgY29uc3Qgc3RhdGVLZXkgPSBgJHtjb3Vyc2Uua2V5fToke3Jlc291cmNlLmlkfWA7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnJlc291cmNlU3RhdGVzLmdldChzdGF0ZUtleSk7XG4gICAgY29uc3Qgcm93ID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtcm93XCIgfSk7XG4gICAgcm93LmRhdGFzZXQua2luZCA9IFwicmVzb3VyY2VcIjtcbiAgICBpZiAoIXJlc291cmNlLmRvd25sb2FkZWRQYXRoICYmIHN0YXRlPy5zdGF0dXMgIT09IFwibG9hZGluZ1wiKSB7XG4gICAgICByb3cuYWRkQ2xhc3MoXCJpcy1yZW1vdGVcIik7XG4gICAgfVxuICAgIGlmIChzdGF0ZT8uc3RhdHVzID09PSBcImxvYWRpbmdcIikge1xuICAgICAgcm93LmFkZENsYXNzKFwiaXMtYnVzeVwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBzcGFjZXIgPSByb3cuY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC10b2dnbGUgaXMtbGVhZlwiIH0pO1xuICAgIGNvbnN0IGl0ZW1JY29uID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtaXRlbS1pY29uXCIgfSk7XG4gICAgc2V0SWNvbihpdGVtSWNvbiwgdGhpcy5yZXNvdXJjZUljb25OYW1lKHJlc291cmNlLCBzdGF0ZSkpO1xuICAgIGlmIChzdGF0ZT8uc3RhdHVzID09PSBcImxvYWRpbmdcIikge1xuICAgICAgaXRlbUljb24uYWRkQ2xhc3MoXCJpcy1zcGlubmluZ1wiKTtcbiAgICB9XG5cbiAgICBjb25zdCBsYWJlbCA9IHJvdy5jcmVhdGVEaXYoeyBjbHM6IFwic2Nob29sLWRvd25sb2FkLXBhbmVsLWxhYmVsXCIgfSk7XG4gICAgbGFiZWwuY3JlYXRlRGl2KHsgY2xzOiBcInNjaG9vbC1kb3dubG9hZC1wYW5lbC1uYW1lXCIsIHRleHQ6IHJlc291cmNlLm5hbWUgfSk7XG5cbiAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5vcGVuT3JEb3dubG9hZChjb3Vyc2UsIHJlc291cmNlKTtcbiAgICB9KTtcblxuICAgIGlmIChzdGF0ZT8uc3RhdHVzID09PSBcImVycm9yXCIgJiYgc3RhdGUubWVzc2FnZSkge1xuICAgICAgcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJzY2hvb2wtZG93bmxvYWQtcGFuZWwtc3RhdHVzXCIsIHRleHQ6IHN0YXRlLm1lc3NhZ2UgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZXNvdXJjZUljb25OYW1lKHJlc291cmNlOiBNb29kbGVSZXNvdXJjZSwgc3RhdGU6IFJlc291cmNlU3RhdGUgfCB1bmRlZmluZWQpIHtcbiAgICBpZiAoc3RhdGU/LnN0YXR1cyA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICAgIHJldHVybiBcImxvYWRlci1jaXJjbGVcIjtcbiAgICB9XG4gICAgaWYgKHJlc291cmNlLmRvd25sb2FkZWRQYXRoKSB7XG4gICAgICByZXR1cm4gXCJmaWxlXCI7XG4gICAgfVxuICAgIHJldHVybiBcImNsb3VkLWRvd25sb2FkXCI7XG4gIH1cbn1cbiIsICJpbXBvcnQgZnMgZnJvbSBcIm5vZGU6ZnMvcHJvbWlzZXNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGV4ZWNGaWxlIGFzIGV4ZWNGaWxlQ2FsbGJhY2sgfSBmcm9tIFwibm9kZTpjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tIFwibm9kZTp1dGlsXCI7XG5pbXBvcnQgdHlwZSB7IENvdXJzZUluZm8sIERvd25sb2FkUmVzdWx0LCBNb29kbGVSZXNvdXJjZSwgU2VjdGlvbkdyb3VwLCBTZW1lc3RlckluZm8gfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5jb25zdCBleGVjRmlsZSA9IHByb21pc2lmeShleGVjRmlsZUNhbGxiYWNrKTtcblxudHlwZSBTbmFwc2hvdENvdXJzZSA9IHtcbiAgY291cnNlSWQ/OiBzdHJpbmcgfCBudW1iZXI7XG4gIHRpdGxlPzogc3RyaW5nO1xufTtcblxudHlwZSBEaXJlY3RvcnlTbmFwc2hvdCA9IE1hcDxzdHJpbmcsIHsgc2l6ZTogbnVtYmVyOyBtdGltZU1zOiBudW1iZXIgfT47XG5cbmV4cG9ydCBmdW5jdGlvbiBzbHVnaWZ5U2VjdGlvbihuYW1lOiBzdHJpbmcpIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5hbWVcbiAgICAubm9ybWFsaXplKFwiTkZLRFwiKVxuICAgIC5yZXBsYWNlKC9bXFx1MDMwMC1cXHUwMzZmXS9nLCBcIlwiKVxuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnJlcGxhY2UoL1teYS16MC05XSsvZywgXCItXCIpXG4gICAgLnJlcGxhY2UoL14tK3wtKyQvZywgXCJcIik7XG4gIHJldHVybiBub3JtYWxpemVkIHx8IFwibWlzY1wiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJlZmVycmVkTW9vZGxlQmluYXJ5KHByZWZlcnJlZDogc3RyaW5nKSB7XG4gIGlmIChwcmVmZXJyZWQudHJpbSgpKSByZXR1cm4gcHJlZmVycmVkLnRyaW0oKTtcbiAgcmV0dXJuIFwiL1VzZXJzL29saS9nby9iaW4vbW9vZGxlXCI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0U2VtZXN0ZXJzKHJvb3RQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFNlbWVzdGVySW5mb1tdPiB7XG4gIGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyKHJvb3RQYXRoLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG4gIGNvbnN0IHNlbWVzdGVyczogU2VtZXN0ZXJJbmZvW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICBpZiAoIWVudHJ5LmlzRGlyZWN0b3J5KCkgfHwgZW50cnkubmFtZS5zdGFydHNXaXRoKFwiLlwiKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHNlbWVzdGVyUGF0aCA9IHBhdGguam9pbihyb290UGF0aCwgZW50cnkubmFtZSk7XG4gICAgY29uc3QgY291cnNlcyA9IGF3YWl0IGxpc3RDb3Vyc2VzSW5TZW1lc3RlcihzZW1lc3RlclBhdGgsIGVudHJ5Lm5hbWUpO1xuICAgIGlmIChjb3Vyc2VzLmxlbmd0aCkge1xuICAgICAgc2VtZXN0ZXJzLnB1c2goe1xuICAgICAgICBrZXk6IGBzZW1lc3Rlcjoke2VudHJ5Lm5hbWV9YCxcbiAgICAgICAgbmFtZTogZW50cnkubmFtZSxcbiAgICAgICAgcGF0aDogc2VtZXN0ZXJQYXRoLFxuICAgICAgICBjb3Vyc2VzLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNlbWVzdGVycy5zb3J0KChsZWZ0LCByaWdodCkgPT4gcmlnaHQubmFtZS5sb2NhbGVDb21wYXJlKGxlZnQubmFtZSkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0Q291cnNlc0luU2VtZXN0ZXIoc2VtZXN0ZXJQYXRoOiBzdHJpbmcsIHRlcm1OYW1lOiBzdHJpbmcpOiBQcm9taXNlPENvdXJzZUluZm9bXT4ge1xuICBjb25zdCBlbnRyaWVzID0gYXdhaXQgZnMucmVhZGRpcihzZW1lc3RlclBhdGgsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcbiAgY29uc3QgY291cnNlczogQ291cnNlSW5mb1tdID0gW107XG5cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgaWYgKCFlbnRyeS5pc0RpcmVjdG9yeSgpIHx8IGVudHJ5Lm5hbWUuc3RhcnRzV2l0aChcIi5cIikpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBjb3Vyc2VEaXIgPSBwYXRoLmpvaW4oc2VtZXN0ZXJQYXRoLCBlbnRyeS5uYW1lKTtcbiAgICBjb25zdCBzbmFwc2hvdFBhdGggPSBwYXRoLmpvaW4oY291cnNlRGlyLCBcIm1vb2RsZS1jb3Vyc2UuanNvblwiKTtcbiAgICBpZiAoIShhd2FpdCBleGlzdHMoc25hcHNob3RQYXRoKSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHJlYWRKc29uRmlsZTxTbmFwc2hvdENvdXJzZT4oc25hcHNob3RQYXRoKTtcbiAgICBjb25zdCBjb3Vyc2VJZCA9IFN0cmluZyhzbmFwc2hvdC5jb3Vyc2VJZCB8fCBcIlwiKS50cmltKCk7XG4gICAgaWYgKCFjb3Vyc2VJZCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvdXJzZXMucHVzaCh7XG4gICAgICBrZXk6IGBjb3Vyc2U6JHt0ZXJtTmFtZX06JHtlbnRyeS5uYW1lfWAsXG4gICAgICBzbHVnOiBlbnRyeS5uYW1lLFxuICAgICAgdGl0bGU6IChzbmFwc2hvdC50aXRsZSB8fCAoYXdhaXQgcmVhZENvdXJzZVRpdGxlKGNvdXJzZURpcikpIHx8IGVudHJ5Lm5hbWUpLnRyaW0oKSxcbiAgICAgIGNvdXJzZUlkLFxuICAgICAgY291cnNlRGlyLFxuICAgICAgc25hcHNob3RQYXRoLFxuICAgICAgdGVybU5hbWUsXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gY291cnNlcy5zb3J0KChsZWZ0LCByaWdodCkgPT4gbGVmdC50aXRsZS5sb2NhbGVDb21wYXJlKHJpZ2h0LnRpdGxlKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRDb3Vyc2VUaXRsZShjb3Vyc2VEaXI6IHN0cmluZykge1xuICBjb25zdCByZWFkbWVQYXRoID0gcGF0aC5qb2luKGNvdXJzZURpciwgXCJSRUFETUUubWRcIik7XG4gIGlmICghKGF3YWl0IGV4aXN0cyhyZWFkbWVQYXRoKSkpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0ZXh0ID0gYXdhaXQgZnMucmVhZEZpbGUocmVhZG1lUGF0aCwgXCJ1dGY4XCIpO1xuICBjb25zdCBsaW5lID0gdGV4dC5zcGxpdChcIlxcblwiKS5maW5kKChlbnRyeSkgPT4gZW50cnkuc3RhcnRzV2l0aChcIiMgXCIpKTtcbiAgcmV0dXJuIGxpbmUgPyBsaW5lLnNsaWNlKDIpLnRyaW0oKSA6IFwiXCI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0Q291cnNlRmlsZXMobW9vZGxlQmluYXJ5OiBzdHJpbmcsIGNvdXJzZTogQ291cnNlSW5mbyk6IFByb21pc2U8U2VjdGlvbkdyb3VwW10+IHtcbiAgY29uc3Qgb3V0cHV0ID0gYXdhaXQgcnVuTW9vZGxlSnNvbjxNb29kbGVSZXNvdXJjZVtdPihtb29kbGVCaW5hcnksIFtcImxpc3RcIiwgXCJmaWxlc1wiLCBjb3Vyc2UuY291cnNlSWQsIFwiLS1qc29uXCJdKTtcbiAgY29uc3QgcmVzb3VyY2VzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgb3V0cHV0XG4gICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnR5cGUgPT09IFwicmVzb3VyY2VcIilcbiAgICAgIC5tYXAoYXN5bmMgKGl0ZW0pID0+IHtcbiAgICAgICAgY29uc3QgcmVzb3VyY2U6IE1vb2RsZVJlc291cmNlID0ge1xuICAgICAgICAgIC4uLml0ZW0sXG4gICAgICAgICAgY291cnNlSWQ6IFN0cmluZyhpdGVtLmNvdXJzZUlkIHx8IGNvdXJzZS5jb3Vyc2VJZCksXG4gICAgICAgICAgc2VjdGlvbklkOiBTdHJpbmcoaXRlbS5zZWN0aW9uSWQgfHwgXCJcIiksXG4gICAgICAgICAgc2VjdGlvbk5hbWU6IFN0cmluZyhpdGVtLnNlY3Rpb25OYW1lIHx8IFwibWlzY1wiKSxcbiAgICAgICAgICBmaWxlVHlwZTogU3RyaW5nKGl0ZW0uZmlsZVR5cGUgfHwgXCJcIiksXG4gICAgICAgICAgdXBsb2FkZWRBdDogaXRlbS51cGxvYWRlZEF0ID8gU3RyaW5nKGl0ZW0udXBsb2FkZWRBdCkgOiBudWxsLFxuICAgICAgICAgIHVybDogaXRlbS51cmwgPyBTdHJpbmcoaXRlbS51cmwpIDogbnVsbCxcbiAgICAgICAgICBkb3dubG9hZGVkUGF0aDogbnVsbCxcbiAgICAgICAgfTtcbiAgICAgICAgcmVzb3VyY2UuZG93bmxvYWRlZFBhdGggPSBhd2FpdCBmaW5kRG93bmxvYWRlZEZpbGUoY291cnNlLCByZXNvdXJjZSk7XG4gICAgICAgIHJldHVybiByZXNvdXJjZTtcbiAgICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBTZWN0aW9uR3JvdXA+KCk7XG4gIGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG4gICAgY29uc3QgbmFtZSA9IHJlc291cmNlLnNlY3Rpb25OYW1lIHx8IFwibWlzY1wiO1xuICAgIGNvbnN0IGtleSA9IGBzZWN0aW9uOiR7Y291cnNlLmNvdXJzZUlkfToke25hbWV9YDtcbiAgICBjb25zdCBjdXJyZW50ID0gZ3JvdXBzLmdldChrZXkpIHx8IHsga2V5LCBuYW1lLCByZXNvdXJjZXM6IFtdIH07XG4gICAgY3VycmVudC5yZXNvdXJjZXMucHVzaChyZXNvdXJjZSk7XG4gICAgZ3JvdXBzLnNldChrZXksIGN1cnJlbnQpO1xuICB9XG5cbiAgcmV0dXJuIFsuLi5ncm91cHMudmFsdWVzKCldXG4gICAgLm1hcCgoZ3JvdXApID0+ICh7XG4gICAgICAuLi5ncm91cCxcbiAgICAgIHJlc291cmNlczogZ3JvdXAucmVzb3VyY2VzLnNvcnQoY29tcGFyZVJlc291cmNlcyksXG4gICAgfSkpXG4gICAgLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiBsZWZ0Lm5hbWUubG9jYWxlQ29tcGFyZShyaWdodC5uYW1lKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkb3dubG9hZENvdXJzZUZpbGUobW9vZGxlQmluYXJ5OiBzdHJpbmcsIGNvdXJzZTogQ291cnNlSW5mbywgcmVzb3VyY2U6IE1vb2RsZVJlc291cmNlKTogUHJvbWlzZTxEb3dubG9hZFJlc3VsdD4ge1xuICBjb25zdCBvdXRwdXREaXIgPSBwYXRoLmpvaW4oY291cnNlLmNvdXJzZURpciwgXCJtYXRlcmlhbHNcIiwgc2x1Z2lmeVNlY3Rpb24ocmVzb3VyY2Uuc2VjdGlvbk5hbWUgfHwgXCJtaXNjXCIpKTtcbiAgYXdhaXQgZnMubWtkaXIob3V0cHV0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICBjb25zdCBiZWZvcmUgPSBhd2FpdCBzbmFwc2hvdERpcmVjdG9yeShvdXRwdXREaXIpO1xuICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0ZpbGUobW9vZGxlQmluYXJ5LCBbXCJkb3dubG9hZFwiLCBcImZpbGVcIiwgY291cnNlLmNvdXJzZUlkLCByZXNvdXJjZS5pZCwgXCItLW91dHB1dC1kaXJcIiwgb3V0cHV0RGlyXSwge1xuICAgIG1heEJ1ZmZlcjogMjAgKiAxMDI0ICogMTAyNCxcbiAgfSk7XG4gIGNvbnN0IGFmdGVyID0gYXdhaXQgc25hcHNob3REaXJlY3Rvcnkob3V0cHV0RGlyKTtcbiAgY29uc3Qgc2F2ZWRGaWxlcyA9IGRldGVjdFNhdmVkRmlsZXMob3V0cHV0RGlyLCBiZWZvcmUsIGFmdGVyKTtcblxuICByZXR1cm4ge1xuICAgIG91dHB1dERpcixcbiAgICBzYXZlZEZpbGVzLFxuICAgIHN0ZG91dDogc3Rkb3V0LnRyaW0oKSxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmREb3dubG9hZGVkRmlsZShjb3Vyc2U6IENvdXJzZUluZm8sIHJlc291cmNlOiBNb29kbGVSZXNvdXJjZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICBjb25zdCBvdXRwdXREaXIgPSBwYXRoLmpvaW4oY291cnNlLmNvdXJzZURpciwgXCJtYXRlcmlhbHNcIiwgc2x1Z2lmeVNlY3Rpb24ocmVzb3VyY2Uuc2VjdGlvbk5hbWUgfHwgXCJtaXNjXCIpKTtcbiAgaWYgKCEoYXdhaXQgZXhpc3RzKG91dHB1dERpcikpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgZW50cmllcyA9IGF3YWl0IGZzLnJlYWRkaXIob3V0cHV0RGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG4gIGNvbnN0IGZpbGVzID0gZW50cmllcy5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5pc0ZpbGUoKSkubWFwKChlbnRyeSkgPT4gZW50cnkubmFtZSk7XG4gIGlmICghZmlsZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBleGFjdE5hbWUgPSByZXNvdXJjZS5maWxlVHlwZSA/IGAke3Jlc291cmNlLm5hbWV9LiR7cmVzb3VyY2UuZmlsZVR5cGV9YCA6IHJlc291cmNlLm5hbWU7XG4gIGNvbnN0IGV4YWN0TWF0Y2ggPSBmaWxlcy5maW5kKChuYW1lKSA9PiBuYW1lID09PSBleGFjdE5hbWUpO1xuICBpZiAoZXhhY3RNYXRjaCkge1xuICAgIHJldHVybiBwYXRoLmpvaW4ob3V0cHV0RGlyLCBleGFjdE1hdGNoKTtcbiAgfVxuXG4gIGNvbnN0IG5vcm1hbGl6ZWRUYXJnZXQgPSBub3JtYWxpemVOYW1lKHJlc291cmNlLm5hbWUpO1xuICBjb25zdCBiYXNlbmFtZU1hdGNoID0gZmlsZXMuZmluZCgobmFtZSkgPT4gbm9ybWFsaXplTmFtZShwYXRoLnBhcnNlKG5hbWUpLm5hbWUpID09PSBub3JtYWxpemVkVGFyZ2V0KTtcbiAgaWYgKGJhc2VuYW1lTWF0Y2gpIHtcbiAgICByZXR1cm4gcGF0aC5qb2luKG91dHB1dERpciwgYmFzZW5hbWVNYXRjaCk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuTW9vZGxlSnNvbjxUPihtb29kbGVCaW5hcnk6IHN0cmluZywgYXJnczogc3RyaW5nW10pIHtcbiAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGUobW9vZGxlQmluYXJ5LCBhcmdzLCB7IG1heEJ1ZmZlcjogMjAgKiAxMDI0ICogMTAyNCB9KTtcbiAgaWYgKHN0ZGVyci50cmltKCkpIHtcbiAgICBjb25zdCBsb3dlciA9IHN0ZGVyci50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChsb3dlci5pbmNsdWRlcyhcIm5vdCBmb3VuZFwiKSB8fCBsb3dlci5pbmNsdWRlcyhcImNvbW1hbmQgbm90IGZvdW5kXCIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vb2RsZSBiaW5hcnkgbm90IHVzYWJsZTogJHttb29kbGVCaW5hcnl9YCk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2Uoc3Rkb3V0KSBhcyBUO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcmVhZCBNb29kbGUgSlNPTiBvdXRwdXQ6ICR7bWVzc2FnZX1gKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiByZWFkSnNvbkZpbGU8VD4oZmlsZVBhdGg6IHN0cmluZykge1xuICByZXR1cm4gSlNPTi5wYXJzZShhd2FpdCBmcy5yZWFkRmlsZShmaWxlUGF0aCwgXCJ1dGY4XCIpKSBhcyBUO1xufVxuXG5hc3luYyBmdW5jdGlvbiBleGlzdHMoZmlsZVBhdGg6IHN0cmluZykge1xuICB0cnkge1xuICAgIGF3YWl0IGZzLmFjY2VzcyhmaWxlUGF0aCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzbmFwc2hvdERpcmVjdG9yeShkaXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPERpcmVjdG9yeVNuYXBzaG90PiB7XG4gIGNvbnN0IHNuYXBzaG90OiBEaXJlY3RvcnlTbmFwc2hvdCA9IG5ldyBNYXAoKTtcbiAgY29uc3QgZW50cmllcyA9IGF3YWl0IGZzLnJlYWRkaXIoZGlyUGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICBpZiAoIWVudHJ5LmlzRmlsZSgpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oZGlyUGF0aCwgZW50cnkubmFtZSk7XG4gICAgY29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQoZmlsZVBhdGgpO1xuICAgIHNuYXBzaG90LnNldChlbnRyeS5uYW1lLCB7IHNpemU6IHN0YXQuc2l6ZSwgbXRpbWVNczogc3RhdC5tdGltZU1zIH0pO1xuICB9XG4gIHJldHVybiBzbmFwc2hvdDtcbn1cblxuZnVuY3Rpb24gZGV0ZWN0U2F2ZWRGaWxlcyhvdXRwdXREaXI6IHN0cmluZywgYmVmb3JlOiBEaXJlY3RvcnlTbmFwc2hvdCwgYWZ0ZXI6IERpcmVjdG9yeVNuYXBzaG90KSB7XG4gIGNvbnN0IGNoYW5nZWQgPSBbLi4uYWZ0ZXIuZW50cmllcygpXVxuICAgIC5maWx0ZXIoKFtuYW1lLCBjdXJyZW50XSkgPT4ge1xuICAgICAgY29uc3QgcHJldmlvdXMgPSBiZWZvcmUuZ2V0KG5hbWUpO1xuICAgICAgcmV0dXJuICFwcmV2aW91cyB8fCBwcmV2aW91cy5tdGltZU1zICE9PSBjdXJyZW50Lm10aW1lTXMgfHwgcHJldmlvdXMuc2l6ZSAhPT0gY3VycmVudC5zaXplO1xuICAgIH0pXG4gICAgLm1hcCgoW25hbWVdKSA9PiBwYXRoLmpvaW4ob3V0cHV0RGlyLCBuYW1lKSk7XG5cbiAgaWYgKGNoYW5nZWQubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNoYW5nZWQuc29ydCgpO1xuICB9XG5cbiAgY29uc3QgZmFsbGJhY2sgPSBbLi4uYWZ0ZXIuZW50cmllcygpXVxuICAgIC5zb3J0KChsZWZ0LCByaWdodCkgPT4gcmlnaHRbMV0ubXRpbWVNcyAtIGxlZnRbMV0ubXRpbWVNcylcbiAgICAubWFwKChbbmFtZV0pID0+IHBhdGguam9pbihvdXRwdXREaXIsIG5hbWUpKTtcbiAgcmV0dXJuIGZhbGxiYWNrLnNsaWNlKDAsIDEpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlUmVzb3VyY2VzKGxlZnQ6IE1vb2RsZVJlc291cmNlLCByaWdodDogTW9vZGxlUmVzb3VyY2UpIHtcbiAgaWYgKGxlZnQudXBsb2FkZWRBdCAmJiByaWdodC51cGxvYWRlZEF0ICYmIGxlZnQudXBsb2FkZWRBdCAhPT0gcmlnaHQudXBsb2FkZWRBdCkge1xuICAgIHJldHVybiByaWdodC51cGxvYWRlZEF0LmxvY2FsZUNvbXBhcmUobGVmdC51cGxvYWRlZEF0KTtcbiAgfVxuICByZXR1cm4gbGVmdC5uYW1lLmxvY2FsZUNvbXBhcmUocmlnaHQubmFtZSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5hbWUodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gdmFsdWUubm9ybWFsaXplKFwiTkZLQ1wiKS50cmltKCku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Z0IseUJBQVE7QUFDNUIsWUFBTSxJQUFJLE1BQU0sa0NBQWtDLFlBQVksRUFBRTtBQUFBLElBQ2xFO0FBQ0EsVUFBTSxPQUFPLEtBQUssSUFBSSxVQUFVLFFBQVEsSUFBSTtBQUM1QyxVQUFNLEtBQUssU0FBUyxNQUFNLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDMUMsU0FBSyxJQUFJLFVBQVUsV0FBVyxJQUFJO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE1BQU0scUJBQXFCO0FBQ3pCLFVBQU0sZUFBZSxXQUFXLEtBQUssZ0JBQWdCLENBQUM7QUFDdEQsVUFBTSxVQUFVLG1EQUFtRCxZQUFZO0FBQy9FLFVBQU0sRUFBRSxRQUFRLE9BQU8sSUFBSSxNQUFNRixVQUFTLFlBQVksQ0FBQyxPQUFPLE9BQU8sR0FBRztBQUFBLE1BQ3RFLEtBQUssS0FBSyxhQUFhO0FBQUEsTUFDdkIsV0FBVyxLQUFLLE9BQU87QUFBQSxJQUN6QixDQUFDO0FBQ0QsV0FBTyxDQUFDLE9BQU8sS0FBSyxHQUFHLE9BQU8sS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxJQUFJLEVBQUUsS0FBSztBQUFBLEVBQ3hFO0FBQUEsRUFFQSxNQUFjLGlCQUFpQjtBQUM3QixVQUFNLFVBQStCO0FBQUEsTUFDbkMsVUFBVSxLQUFLO0FBQUEsTUFDZixpQkFBaUIsT0FBTyxZQUFZLEtBQUssZ0JBQWdCLFFBQVEsQ0FBQztBQUFBLElBQ3BFO0FBQ0EsVUFBTSxLQUFLLFNBQVMsT0FBTztBQUFBLEVBQzdCO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixjQUFzQjtBQUNuRCxhQUFTLFVBQVUsR0FBRyxVQUFVLElBQUksV0FBVyxHQUFHO0FBQ2hELFlBQU0sT0FBTyxLQUFLLElBQUksTUFBTSxzQkFBc0IsWUFBWTtBQUM5RCxVQUFJLGdCQUFnQix3QkFBTztBQUN6QixlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU0sZUFBZSxNQUFNLEtBQUssSUFBSSxNQUFNLFFBQVEsT0FBTyxZQUFZO0FBQ3JFLFVBQUksQ0FBQyxjQUFjO0FBQ2pCO0FBQUEsTUFDRjtBQUVBLFlBQU0sTUFBTSxHQUFHO0FBQUEsSUFDakI7QUFFQSxXQUFPLEtBQUssSUFBSSxNQUFNLHNCQUFzQixZQUFZO0FBQUEsRUFDMUQ7QUFDRjtBQUVBLFNBQVMsTUFBTSxJQUFZO0FBQ3pCLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWSxXQUFXLFNBQVMsRUFBRSxDQUFDO0FBQ3pEO0FBRUEsU0FBUyxXQUFXLE9BQWU7QUFDakMsU0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLE9BQU8sQ0FBQztBQUN6QzsiLAogICJuYW1lcyI6IFsiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfbm9kZV9jaGlsZF9wcm9jZXNzIiwgImltcG9ydF9ub2RlX3V0aWwiLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJleGVjRmlsZUNhbGxiYWNrIiwgImZzIiwgInBhdGgiLCAiZXhlY0ZpbGUiLCAiZXhlY0ZpbGVDYWxsYmFjayIsICJwYXRoIl0KfQo=
