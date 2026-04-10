export type SemesterInfo = {
  key: string;
  name: string;
  path: string;
  courses: CourseInfo[];
};

export type CourseInfo = {
  key: string;
  slug: string;
  title: string;
  courseId: string;
  courseDir: string;
  snapshotPath: string;
  termName: string;
};

export type MoodleResource = {
  id: string;
  name: string;
  type: string;
  courseId: string;
  sectionId: string;
  sectionName: string;
  fileType: string;
  uploadedAt: string | null;
  url: string | null;
  downloadedPath: string | null;
};

export type SectionGroup = {
  key: string;
  name: string;
  resources: MoodleResource[];
};

export type DownloadResult = {
  outputDir: string;
  savedFiles: string[];
  stdout: string;
};
