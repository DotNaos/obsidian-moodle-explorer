import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { CourseInfo, DownloadResult, MoodleResource, SectionGroup, SemesterInfo } from "./types";

const execFile = promisify(execFileCallback);

type SnapshotCourse = {
  courseId?: string | number;
  title?: string;
};

type DirectorySnapshot = Map<string, { size: number; mtimeMs: number }>;

export function slugifySection(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "misc";
}

export function getPreferredMoodleBinary(preferred: string) {
  if (preferred.trim()) return preferred.trim();
  return "/Users/oli/go/bin/moodle";
}

export async function listSemesters(rootPath: string): Promise<SemesterInfo[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const semesters: SemesterInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const semesterPath = path.join(rootPath, entry.name);
    const courses = await listCoursesInSemester(semesterPath, entry.name);
    if (courses.length) {
      semesters.push({
        key: `semester:${entry.name}`,
        name: entry.name,
        path: semesterPath,
        courses,
      });
    }
  }

  return semesters.sort((left, right) => right.name.localeCompare(left.name));
}

async function listCoursesInSemester(semesterPath: string, termName: string): Promise<CourseInfo[]> {
  const entries = await fs.readdir(semesterPath, { withFileTypes: true });
  const courses: CourseInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const courseDir = path.join(semesterPath, entry.name);
    const snapshotPath = path.join(courseDir, "moodle-course.json");
    if (!(await exists(snapshotPath))) {
      continue;
    }
    const snapshot = await readJsonFile<SnapshotCourse>(snapshotPath);
    const courseId = String(snapshot.courseId || "").trim();
    if (!courseId) {
      continue;
    }
    courses.push({
      key: `course:${termName}:${entry.name}`,
      slug: entry.name,
      title: (snapshot.title || (await readCourseTitle(courseDir)) || entry.name).trim(),
      courseId,
      courseDir,
      snapshotPath,
      termName,
    });
  }

  return courses.sort((left, right) => left.title.localeCompare(right.title));
}

async function readCourseTitle(courseDir: string) {
  const readmePath = path.join(courseDir, "README.md");
  if (!(await exists(readmePath))) {
    return "";
  }
  const text = await fs.readFile(readmePath, "utf8");
  const line = text.split("\n").find((entry) => entry.startsWith("# "));
  return line ? line.slice(2).trim() : "";
}

export async function listCourseFiles(moodleBinary: string, course: CourseInfo): Promise<SectionGroup[]> {
  const output = await runMoodleJson<MoodleResource[]>(moodleBinary, ["list", "files", course.courseId, "--json"]);
  const resources = await Promise.all(
    output
      .filter((item) => item.type === "resource")
      .map(async (item) => {
        const resource: MoodleResource = {
          ...item,
          courseId: String(item.courseId || course.courseId),
          sectionId: String(item.sectionId || ""),
          sectionName: String(item.sectionName || "misc"),
          fileType: String(item.fileType || ""),
          uploadedAt: item.uploadedAt ? String(item.uploadedAt) : null,
          url: item.url ? String(item.url) : null,
          downloadedPath: null,
        };
        resource.downloadedPath = await findDownloadedFile(course, resource);
        return resource;
      }),
  );

  const groups = new Map<string, SectionGroup>();
  for (const resource of resources) {
    const name = resource.sectionName || "misc";
    const key = `section:${course.courseId}:${name}`;
    const current = groups.get(key) || { key, name, resources: [] };
    current.resources.push(resource);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      resources: group.resources.sort(compareResources),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function downloadCourseFile(moodleBinary: string, course: CourseInfo, resource: MoodleResource): Promise<DownloadResult> {
  const outputDir = path.join(course.courseDir, "materials", slugifySection(resource.sectionName || "misc"));
  await fs.mkdir(outputDir, { recursive: true });

  const before = await snapshotDirectory(outputDir);
  const { stdout } = await execFile(moodleBinary, ["download", "file", course.courseId, resource.id, "--output-dir", outputDir], {
    maxBuffer: 20 * 1024 * 1024,
  });
  const after = await snapshotDirectory(outputDir);
  const savedFiles = detectSavedFiles(outputDir, before, after);

  return {
    outputDir,
    savedFiles,
    stdout: stdout.trim(),
  };
}

export async function findDownloadedFile(course: CourseInfo, resource: MoodleResource): Promise<string | null> {
  const outputDir = path.join(course.courseDir, "materials", slugifySection(resource.sectionName || "misc"));
  if (!(await exists(outputDir))) {
    return null;
  }
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  if (!files.length) {
    return null;
  }

  const exactName = resource.fileType ? `${resource.name}.${resource.fileType}` : resource.name;
  const exactMatch = files.find((name) => name === exactName);
  if (exactMatch) {
    return path.join(outputDir, exactMatch);
  }

  const normalizedTarget = normalizeName(resource.name);
  const basenameMatch = files.find((name) => normalizeName(path.parse(name).name) === normalizedTarget);
  if (basenameMatch) {
    return path.join(outputDir, basenameMatch);
  }

  return null;
}

async function runMoodleJson<T>(moodleBinary: string, args: string[]) {
  const { stdout, stderr } = await execFile(moodleBinary, args, { maxBuffer: 20 * 1024 * 1024 });
  if (stderr.trim()) {
    const lower = stderr.toLowerCase();
    if (lower.includes("not found") || lower.includes("command not found")) {
      throw new Error(`Moodle binary not usable: ${moodleBinary}`);
    }
  }
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Moodle JSON output: ${message}`);
  }
}

async function readJsonFile<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function snapshotDirectory(dirPath: string): Promise<DirectorySnapshot> {
  const snapshot: DirectorySnapshot = new Map();
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(dirPath, entry.name);
    const stat = await fs.stat(filePath);
    snapshot.set(entry.name, { size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return snapshot;
}

function detectSavedFiles(outputDir: string, before: DirectorySnapshot, after: DirectorySnapshot) {
  const changed = [...after.entries()]
    .filter(([name, current]) => {
      const previous = before.get(name);
      return !previous || previous.mtimeMs !== current.mtimeMs || previous.size !== current.size;
    })
    .map(([name]) => path.join(outputDir, name));

  if (changed.length) {
    return changed.sort();
  }

  const fallback = [...after.entries()]
    .sort((left, right) => right[1].mtimeMs - left[1].mtimeMs)
    .map(([name]) => path.join(outputDir, name));
  return fallback.slice(0, 1);
}

function compareResources(left: MoodleResource, right: MoodleResource) {
  if (left.uploadedAt && right.uploadedAt && left.uploadedAt !== right.uploadedAt) {
    return right.uploadedAt.localeCompare(left.uploadedAt);
  }
  return left.name.localeCompare(right.name);
}

function normalizeName(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}
