import path from "node:path";
import { ItemView, Notice, Setting, setIcon, type WorkspaceLeaf } from "obsidian";
import type SchoolDownloadPanelPlugin from "./main";
import type { CourseInfo, MoodleResource, SectionGroup, SemesterInfo } from "./types";

export const VIEW_TYPE_SCHOOL_DOWNLOAD = "school-download-panel-view";

type ResourceState = {
  status: "loading" | "error";
  message?: string;
};

export class SchoolDownloadPanelView extends ItemView {
  private semesters: SemesterInfo[] = [];
  private readonly expanded = new Set<string>();
  private readonly courseFiles = new Map<string, SectionGroup[]>();
  private readonly loadingCourses = new Set<string>();
  private readonly resourceStates = new Map<string, ResourceState>();
  private loadingSemesters = false;
  private refreshingLogin = false;
  private loadError = "";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SchoolDownloadPanelPlugin) {
    super(leaf);
  }

  override getViewType() {
    return VIEW_TYPE_SCHOOL_DOWNLOAD;
  }

  override getDisplayText() {
    return "School Downloads";
  }

  override getIcon() {
    return "folder-down";
  }

  override async onOpen() {
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

  async ensureCourseFiles(course: CourseInfo) {
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
        new Notice(`Dateiliste konnte nicht geladen werden: ${message}`);
      }
      this.resourceStates.set(`course-error:${course.key}`, { status: "error", message });
    } finally {
      this.loadingCourses.delete(course.key);
      this.render();
    }
  }

  toggle(key: string) {
    if (this.expanded.has(key)) {
      this.expanded.delete(key);
    } else {
      this.expanded.add(key);
    }
    this.render();
  }

  async download(course: CourseInfo, resource: MoodleResource) {
    const stateKey = `${course.key}:${resource.id}`;
    this.resourceStates.set(stateKey, { status: "loading" });
    this.render();
    try {
      const result = await this.plugin.downloadResource(course, resource);
      const saved = result.savedFiles[0] || (await this.plugin.findDownloadedResource(course, resource));
      if (!saved) {
        throw new Error("Die Datei wurde heruntergeladen, aber lokal nicht gefunden.");
      }
      resource.downloadedPath = saved;
      this.resourceStates.delete(stateKey);
      await this.plugin.openAbsolutePath(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.resourceStates.set(stateKey, { status: "error", message });
      new Notice(`Download fehlgeschlagen: ${message}`);
    }
    this.render();
  }

  async openOrDownload(course: CourseInfo, resource: MoodleResource) {
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
      new Notice("Moodle Login erneuert.");
      await this.reloadSemesters();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Login erneuern fehlgeschlagen: ${message}`);
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
    new Setting(toolbar)
      .addButton((button) =>
        button
          .setButtonText(this.refreshingLogin ? "Login..." : "Login erneuern")
          .setDisabled(this.refreshingLogin)
          .onClick(() => {
            void this.refreshLogin();
          }),
      )
      .addButton((button) =>
        button.setButtonText("Neu laden").setCta().onClick(() => {
          void this.reloadSemesters();
        }),
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

  private renderFolderRow(parent: HTMLElement, key: string, label: string, kind: string, onExpand?: () => Promise<void>) {
    const row = parent.createDiv({ cls: "school-download-panel-row" });
    row.dataset.kind = kind;
    const expanded = this.expanded.has(key);

    const toggle = row.createDiv({ cls: "school-download-panel-toggle" });
    setIcon(toggle, expanded ? "chevron-down" : "chevron-right");

    const itemIcon = row.createDiv({ cls: "school-download-panel-item-icon" });
    setIcon(itemIcon, expanded ? "folder-open" : "folder");

    row.addEventListener("click", () => {
      this.toggle(key);
      if (!expanded && onExpand) {
        void onExpand();
      }
    });

    const labelEl = row.createDiv({ cls: "school-download-panel-label" });
    labelEl.createDiv({ cls: "school-download-panel-name", text: label });
  }

  private renderResourceRow(parent: HTMLElement, course: CourseInfo, resource: MoodleResource) {
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
    setIcon(itemIcon, this.resourceIconName(resource, state));
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

  private resourceIconName(resource: MoodleResource, state: ResourceState | undefined) {
    if (state?.status === "loading") {
      return "loader-circle";
    }
    if (resource.downloadedPath) {
      return "file";
    }
    return "cloud-download";
  }
}
