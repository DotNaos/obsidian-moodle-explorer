import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { FileSystemAdapter, Plugin, TFile } from "obsidian";
import { SchoolDownloadPanelSettingTab, DEFAULT_SETTINGS, type SchoolDownloadPanelSettings } from "./settings";
import { VIEW_TYPE_SCHOOL_DOWNLOAD, SchoolDownloadPanelView } from "./download-view";
import { downloadCourseFile, findDownloadedFile, getPreferredMoodleBinary, listCourseFiles, listSemesters, slugifySection } from "./school-data";
import type { CourseInfo, MoodleResource, SectionGroup } from "./types";

const execFile = promisify(execFileCallback);

type PersistedPluginData = {
  settings?: Partial<SchoolDownloadPanelSettings>;
  courseFileCache?: Record<string, SectionGroup[]>;
  moodleBinary?: string;
};

export default class SchoolDownloadPanelPlugin extends Plugin {
  settings: SchoolDownloadPanelSettings = DEFAULT_SETTINGS;
  private courseFileCache = new Map<string, SectionGroup[]>();

  override async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_SCHOOL_DOWNLOAD,
      (leaf) => new SchoolDownloadPanelView(leaf, this),
    );

    this.addRibbonIcon("folder-down", "Open school download panel", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-school-download-panel",
      name: "Open school download panel",
      callback: () => {
        void this.activateView();
      },
    });

    this.addSettingTab(new SchoolDownloadPanelSettingTab(this));
  }

  override async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SCHOOL_DOWNLOAD);
  }

  async loadSettings() {
    const raw = ((await this.loadData()) as PersistedPluginData | null) || null;
    const legacySettings = raw && !("settings" in raw) ? (raw as Partial<SchoolDownloadPanelSettings>) : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...legacySettings,
      ...(raw?.settings || {}),
    };
    this.courseFileCache = new Map(Object.entries(raw?.courseFileCache || {}));
  }

  async saveSettings() {
    await this.savePluginData();
  }

  getVaultRoot() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
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

  async loadCourseFiles(course: CourseInfo) {
    const sections = await listCourseFiles(this.getMoodleBinary(), course);
    this.courseFileCache.set(course.key, sections);
    await this.savePluginData();
    return sections;
  }

  async downloadResource(course: CourseInfo, resource: MoodleResource) {
    return downloadCourseFile(this.getMoodleBinary(), course, resource);
  }

  async findDownloadedResource(course: CourseInfo, resource: MoodleResource) {
    return findDownloadedFile(course, resource);
  }

  getCachedCourseFiles(course: CourseInfo) {
    return this.courseFileCache.get(course.key) || null;
  }

  async updateCachedCourseFiles(course: CourseInfo, sections: SectionGroup[]) {
    this.courseFileCache.set(course.key, sections);
    await this.savePluginData();
  }

  getMoodleBinary() {
    return getPreferredMoodleBinary(this.settings.moodleBinary);
  }

  toVaultRelative(absolutePath: string) {
    return path.relative(this.getVaultRoot(), absolutePath) || ".";
  }

  slugifySection(name: string) {
    return slugifySection(name);
  }

  async openAbsolutePath(absolutePath: string) {
    const relativePath = this.toVaultRelative(absolutePath);
    const file = await this.waitForVaultFile(relativePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Datei nicht im Vault gefunden: ${relativePath}`);
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file, { active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async refreshMoodleLogin() {
    const quotedBinary = shellQuote(this.getMoodleBinary());
    const command = `set -a; [ -f ~/.env ] && source ~/.env; set +a; ${quotedBinary} login`;
    const { stdout, stderr } = await execFile("/bin/zsh", ["-lc", command], {
      cwd: this.getVaultRoot(),
      maxBuffer: 20 * 1024 * 1024,
    });
    return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
  }

  private async savePluginData() {
    const payload: PersistedPluginData = {
      settings: this.settings,
      courseFileCache: Object.fromEntries(this.courseFileCache.entries()),
    };
    await this.saveData(payload);
  }

  private async waitForVaultFile(relativePath: string) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const file = this.app.vault.getAbstractFileByPath(relativePath);
      if (file instanceof TFile) {
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
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
